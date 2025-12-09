// public/create.js
const socket = io();

// Display game code
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get("code");
document.getElementById("gameCode").textContent = gameCode;

// Handle errors
socket.on("errorMessage", (msg) => {
  document.getElementById("createMessage").textContent = msg;
});

// Copy invite link to clipboard
function copyLink() {
  const link = `${window.location.origin}/pages/setup.html?code=${ localStorage.getItem("gameCode") }`;
  navigator.clipboard.writeText(link);
  document.getElementById("createMessage").textContent = "Link copied to clipboard!";
}

// Continue to setup page
function goToLobby() {
  if (!gameCode) return alert("Game code not ready yet!");
  window.location.href = `/pages/lobby.html?code=${gameCode}`;
}
