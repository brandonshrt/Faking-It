// Load results saved during "gameOver"
const results = JSON.parse(sessionStorage.getItem("gameResults"));
const leaderboard = document.getElementById("leaderboard");
const winnerTitle = document.getElementById("winner-title");

if (!results) {
    winnerTitle.textContent = "Game Over";
} else {
    winnerTitle.textContent = `Winner: ${results.winner.name}`;

    // Sort players by points (descending)
    const sortedPlayers = results.players.sort((a, b) => b.points - a.points);

    sortedPlayers.forEach((player, index) => {
        const rank = index + 1;

        const card = document.createElement("div");
        card.classList.add("player-card");

        card.innerHTML = `
            <h3 style="color:#00d4ff; margin:5px 0;">#${rank}</h3>
            <img class="avatar-img" src="/assets/icons/${player.avatar}.png" alt="">
            <div class="player-name">${player.name}</div>
            <div class="player-points">${player.points} pts</div>
        `;

        leaderboard.appendChild(card);
    });
}

// Return to home
document.getElementById("home-btn").addEventListener("click", () => {
    window.location.href = "/pages/index.html";
});
