import { auth, db, functions, firebaseReady } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { httpsCallable } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";

const $ = (id) => document.getElementById(id);

const sidebar = $("sidebar");
const chatHistory = $("chatHistory");
const welcome = $("welcome");
const messagesEl = $("messages");
const form = $("chatForm");
const input = $("messageInput");
const sendBtn = $("sendBtn");
const notice = $("notice");
const authModal = $("authModal");
const authForm = $("authForm");
const authError = $("authError");
const authModeBtn = $("authModeBtn");
const authSubmitBtn = $("authSubmitBtn");

let currentUser = null;
let currentChatId = null;
let currentMessages = [];
let registerMode = false;
let busy = false;

function showNotice(message) {
  notice.textContent = message;
}

function showError(error) {
  const messages = {
    "auth/email-already-in-use": "Email is already registered. Try signing in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/weak-password": "Use a stronger password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your internet connection."
  };

  return messages[error?.code] || error?.message ||
    "Something went wrong. Please try again.";
}

function openAuth() {
  authError.textContent = "";
  authModal.classList.remove("hidden");
}

function closeAuth() {
  authModal.classList.add("hidden");
}

function renderMessages() {
  messagesEl.replaceChildren();
  welcome.classList.toggle("hidden", currentMessages.length > 0);

  for (const item of currentMessages) {
    const row = document.createElement("div");
    row.className = "message " + (item.role === "user" ? "user" : "assistant");

    const label = document.createElement("span");
    label.className = "message-label";
    label.textContent = item.role === "user" ? "You" : "Jino AI";

    const bubble = document.createElement("div");
    bubble.className = "message-content";
    bubble.textContent = item.text;

    if (item.role === "user") {
      row.append(bubble, label);
    } else {
      row.append(label, bubble);
    }

    messagesEl.append(row);
  }

  $("conversation").scrollTop = $("conversation").scrollHeight;
}

function renderHistory(chats) {
  chatHistory.replaceChildren();

  if (!currentUser) {
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = "Sign in to save your chats.";
    chatHistory.append(p);
    return;
  }

  if (!chats.length) {
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = "No saved chats yet.";
    chatHistory.append(p);
    return;
  }

  for (const chat of chats) {
    const button = document.createElement("button");
    button.className = "history-item" +
      (chat.id === currentChatId ? " active" : "");
    button.textContent = chat.title || "New chat";
    button.title = chat.title || "New chat";
    button.addEventListener("click", () => loadChat(chat.id));
    chatHistory.append(button);
  }
}

async function refreshHistory() {
  if (!currentUser || !db) {
    renderHistory([]);
    return;
  }

  try {
    const chatsRef = collection(db, "users", currentUser.uid, "chats");
    const q = query(chatsRef, orderBy("updatedAt", "desc"), limit(30));
    const snapshot = await getDocs(q);

    renderHistory(snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    })));
  } catch (error) {
    console.error("Could not load chat history:", error);
    showNotice("Could not load chat history. Check Firestore setup and rules.");
  }
}

async function saveChat() {
  if (!currentUser || !db || !currentChatId) return;

  const title = currentMessages.find((m) => m.role === "user")?.text
    ?.slice(0, 60) || "New chat";

  const chatRef = doc(db, "users", currentUser.uid, "chats", currentChatId);

  await setDoc(chatRef, {
    title,
    messages: currentMessages.slice(-40),
    updatedAt: Date.now()
  });

  await refreshHistory();
}

async function loadChat(chatId) {
  if (!currentUser || !db) return;

  try {
    const chatRef = doc(db, "users", currentUser.uid, "chats", chatId);
    const snapshot = await getDoc(chatRef);

    if (!snapshot.exists()) {
      showNotice("That chat could not be found.");
      return;
    }

    currentChatId = chatId;
    currentMessages = Array.isArray(snapshot.data().messages)
      ? snapshot.data().messages
      : [];

    renderMessages();
    await refreshHistory();
    sidebar.classList.remove("open");
  } catch (error) {
    showNotice(showError(error));
  }
}

function newChat() {
  currentChatId = crypto.randomUUID();
  currentMessages = [];
  renderMessages();
  refreshHistory();
  input.focus();
  sidebar.classList.remove("open");
}

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
  input.disabled = value;
  sendBtn.textContent = value ? "…" : "➤";
}

async function sendMessage(text) {
  if (busy || !text.trim()) return;

  if (!firebaseReady) {
    showNotice("Firebase is not configured yet. Complete firebase.js setup first.");
    return;
  }

  if (!currentUser) {
    showNotice("Please sign in before chatting with Jino AI.");
    openAuth();
    return;
  }

  const message = text.trim().slice(0, 4000);
  if (!currentChatId) currentChatId = crypto.randomUUID();

  const previousMessages = currentMessages.slice(-20);
  currentMessages.push({ role: "user", text: message });
  renderMessages();
  input.value = "";
  setBusy(true);
  showNotice("Jino AI is thinking...");

  const language = $("languageSelect").value;

  try {
    const askJinoAI = httpsCallable(functions, "askJinoAI");
    const history = previousMessages.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      text: item.text
    }));

    const result = await askJinoAI({
      message,
      history,
      language
    });

    const reply = result.data?.reply;
    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("The AI returned an empty response.");
    }

    currentMessages.push({ role: "assistant", text: reply.trim() });
    renderMessages();

    await saveChat();
    showNotice("Jino AI can make mistakes. Check important information.");
  } catch (error) {
    console.error("AI request failed:", error);
    currentMessages.push({
      role: "assistant",
      text: "Sorry, I could not answer that. Check your Firebase setup and AI backend deployment, then try again."
    });
    renderMessages();
    showNotice(showError(error));
  } finally {
    setBusy(false);
    input.focus();
  }
}

$("newChatBtn").addEventListener("click", newChat);
$("menuBtn").addEventListener("click", () => sidebar.classList.toggle("open"));
$("loginBtn").addEventListener("click", openAuth);
$("closeAuthBtn").addEventListener("click", closeAuth);

$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("light");
});

authModeBtn.addEventListener("click", () => {
  registerMode = !registerMode;
  $("authTitle").textContent = registerMode ? "Create your account" : "Welcome to Jino AI";
  authSubmitBtn.textContent = registerMode ? "Register" : "Sign in";
  authModeBtn.textContent = registerMode
    ? "Already have an account? Sign in"
    : "Need an account? Register";
  $("authPassword").autocomplete = registerMode ? "new-password" : "current-password";
  authError.textContent = "";
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";

  if (!firebaseReady) {
    authError.textContent = "Firebase is not configured yet.";
    return;
  }

  authSubmitBtn.disabled = true;

  try {
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;

    if (registerMode) {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }

    closeAuth();
    authForm.reset();
  } catch (error) {
    authError.textContent = showError(error);
  } finally {
    authSubmitBtn.disabled = false;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  if (!auth) return;
  await signOut(auth);
  newChat();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendMessage(input.value);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

if (!firebaseReady) {
  showNotice("Website preview mode: add your Firebase configuration to enable sign-in and AI.");
}

if (firebaseReady) {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    $("userStatus").textContent = user ? user.email : "Not signed in";
    $("loginBtn").classList.toggle("hidden", Boolean(user));
    $("logoutBtn").classList.toggle("hidden", !user);

    if (user) {
      await refreshHistory();
    } else {
      currentChatId = null;
      currentMessages = [];
      renderMessages();
      renderHistory([]);
    }
  });
                             }
