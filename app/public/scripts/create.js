// public/create.js
const socket = io();
let gameCode = null;

// Ask server to create a new game when page loads
window.onload = () => {
  socket.emit("createGame");
};

// Receive game code from server
socket.on("gameCreated", ({ code }) => {
  gameCode = code;
  document.getElementById("gameCode").textContent = code;
});

// Handle errors
socket.on("errorMessage", (msg) => {
  document.getElementById("createMessage").textContent = msg;
});

// Copy invite link to clipboard
function copyLink() {
  if (!gameCode) return;
  const link = `${window.location.origin}/join.html?code=${gameCode}`;
  navigator.clipboard.writeText(link);
  document.getElementById("createMessage").textContent = "Link copied to clipboard!";
}

// Continue to setup page
function goToSetup() {
  if (!gameCode) return alert("Game code not ready yet!");
  window.location.href = `/pages/setup.html?code=${gameCode}`;
}
