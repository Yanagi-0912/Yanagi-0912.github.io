const BLOCK_SIZE = 30;
const ROWS = 20;
const COLS = 10;

class Tetris {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.nextCanvas = document.getElementById('nextCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.nextCtx = this.nextCanvas.getContext('2d');
        
        this.canvas.width = COLS * BLOCK_SIZE;
        this.canvas.height = ROWS * BLOCK_SIZE;
        this.nextCanvas.width = 4 * BLOCK_SIZE;
        this.nextCanvas.height = 4 * BLOCK_SIZE;
        
        this.holdCanvas = document.getElementById('holdCanvas');
        this.holdCtx = this.holdCanvas.getContext('2d');
        this.holdCanvas.width = 4 * BLOCK_SIZE;
        this.holdCanvas.height = 4 * BLOCK_SIZE;
        
        this.holdPiece = null;
        this.canHold = true;
        this.rKeyPressed = false;
        this.rKeyTimer = null;

        this.reset();
        this.initControls();
        this.loadLeaderboard();
    }

    reset() {
        this.grid = Array(ROWS).fill().map(() => Array(COLS).fill(0));
        this.score = 0;
        this.gameOver = false;
        this.isPaused = false;
        this.holdPiece = null;
        this.canHold = true;
        this.createNewPiece();
        document.getElementById('score').textContent = this.score;
    }

    createNewPiece() {
        const pieces = [
            [[1,1,1,1]], // I
            [[1,1],[1,1]], // O
            [[1,1,1],[0,1,0]], // T
            [[1,1,1],[1,0,0]], // L
            [[1,1,1],[0,0,1]], // J
            [[1,1,0],[0,1,1]], // S
            [[0,1,1],[1,1,0]]  // Z
        ];
        
        this.currentPiece = {
            shape: this.nextPiece?.shape || pieces[Math.floor(Math.random() * pieces.length)],
            x: Math.floor(COLS/2) - 1,
            y: 0
        };
        
        this.nextPiece = {
            shape: pieces[Math.floor(Math.random() * pieces.length)]
        };
        
        this.drawNextPiece();
        this.canHold = true;
        
        if (this.checkCollision()) {
            this.gameOver = true;
            this.showGameOver();
        }
    }

    drawNextPiece() {
        this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        this.nextPiece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    this.nextCtx.fillStyle = 'cyan';
                    this.nextCtx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE-1, BLOCK_SIZE-1);
                }
            });
        });
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the grid
        this.grid.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    this.ctx.fillStyle = 'blue';
                    this.ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE-1, BLOCK_SIZE-1);
                }
            });
        });
        
        // Draw current piece
        this.currentPiece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    this.ctx.fillStyle = 'cyan';
                    this.ctx.fillRect(
                        (this.currentPiece.x + x) * BLOCK_SIZE,
                        (this.currentPiece.y + y) * BLOCK_SIZE,
                        BLOCK_SIZE-1,
                        BLOCK_SIZE-1
                    );
                }
            });
        });
    }

    checkCollision() {
        return this.currentPiece.shape.some((row, y) => {
            return row.some((value, x) => {
                if (!value) return false;
                const newX = this.currentPiece.x + x;
                const newY = this.currentPiece.y + y;
                return newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && this.grid[newY][newX]);
            });
        });
    }

    rotate() {
        // Changed to clockwise rotation
        const rotated = this.currentPiece.shape[0].map((_, i) =>
            this.currentPiece.shape.map(row => row[i]).reverse()
        );
        
        const originalShape = this.currentPiece.shape;
        this.currentPiece.shape = rotated;
        
        if (this.checkCollision()) {
            this.currentPiece.shape = originalShape;
        }
    }

    rotate180() {
        const rotated = this.currentPiece.shape.map(row => [...row].reverse()).reverse();
        const originalShape = this.currentPiece.shape;
        this.currentPiece.shape = rotated;
        
        if (this.checkCollision()) {
            this.currentPiece.shape = originalShape;
        }
    }

    rotateCounterClockwise() {
        const rotated = this.currentPiece.shape[0].map((_, i) =>
            this.currentPiece.shape.map(row => row[row.length-1-i])
        );
        
        const originalShape = this.currentPiece.shape;
        this.currentPiece.shape = rotated;
        
        if (this.checkCollision()) {
            this.currentPiece.shape = originalShape;
        }
    }

    holdPieceFunc() {
        if (!this.canHold) return;
        
        const currentShape = this.currentPiece.shape;
        if (this.holdPiece === null) {
            this.holdPiece = currentShape;
            this.createNewPiece();
        } else {
            const tempShape = this.holdPiece;
            this.holdPiece = currentShape;
            this.currentPiece = {
                shape: tempShape,
                x: Math.floor(COLS/2) - 1,
                y: 0
            };
        }
        
        this.canHold = false;
        this.drawHoldPiece();
    }

    drawHoldPiece() {
        this.holdCtx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
        if (this.holdPiece) {
            this.holdPiece.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value) {
                        this.holdCtx.fillStyle = 'cyan';
                        this.holdCtx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE-1, BLOCK_SIZE-1);
                    }
                });
            });
        }
    }

    moveDown() {
        this.currentPiece.y++;
        if (this.checkCollision()) {
            this.currentPiece.y--;
            this.mergePiece();
            this.createNewPiece();
        }
        this.draw();
    }

    hardDrop() {
        while (!this.checkCollision()) {
            this.currentPiece.y++;
        }
        this.currentPiece.y--;
        this.mergePiece();
        this.createNewPiece();
        this.draw();
    }

    mergePiece() {
        this.currentPiece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    this.grid[this.currentPiece.y + y][this.currentPiece.x + x] = value;
                }
            });
        });
        
        this.clearLines();
    }

    clearLines() {
        let linesCleared = 0;
        this.grid.forEach((row, y) => {
            if (row.every(value => value)) {
                this.grid.splice(y, 1);
                this.grid.unshift(Array(COLS).fill(0));
                linesCleared++;
            }
        });
        
        if (linesCleared > 0) {
            this.score += linesCleared * 100;
            document.getElementById('score').textContent = this.score;
        }
    }

    initControls() {
        document.addEventListener('keydown', event => {
            if (this.gameOver || this.isPaused) return;
            
            switch(event.keyCode) {
                case 37: // Left
                    this.currentPiece.x--;
                    if (this.checkCollision()) this.currentPiece.x++;
                    break;
                case 39: // Right
                    this.currentPiece.x++;
                    if (this.checkCollision()) this.currentPiece.x--;
                    break;
                case 40: // Down
                    this.moveDown();
                    break;
                case 88: // X
                case 38: // Up
                    this.rotate();
                    break;
                case 90: // Z
                    this.rotateCounterClockwise();
                    break;
                case 65: // A
                    this.rotate180();
                    break;
                case 32: // Space (Hard drop)
                    this.hardDrop();
                    break;
                case 27: // Esc (Pause)
                    this.togglePause();
                    break;
                case 16: // Shift
                case 67: // C
                    this.holdPieceFunc();
                    break;
                case 82: // R
                    if (!this.rKeyPressed) {
                        this.rKeyPressed = true;
                        this.rKeyTimer = setTimeout(() => {
                            this.reset();
                            this.start();
                        }, 1000);
                    }
                    break;
            }
            this.draw();
        });

        document.addEventListener('keyup', event => {
            if (event.keyCode === 82) { // R key
                this.rKeyPressed = false;
                if (this.rKeyTimer) {
                    clearTimeout(this.rKeyTimer);
                    this.rKeyTimer = null;
                }
            }
        });

        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.togglePause();
        });

        document.getElementById('submitScore').addEventListener('click', () => {
            this.submitScore();
        });
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        document.getElementById('pauseBtn').textContent = this.isPaused ? 'Resume' : 'Pause';
    }

    showGameOver() {
        document.getElementById('gameOverModal').style.display = 'block';
        document.getElementById('finalScore').textContent = this.score;
    }

    submitScore() {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) return;

        let leaderboard = JSON.parse(localStorage.getItem('tetrisLeaderboard') || '[]');
        leaderboard.push({ name: playerName, score: this.score });
        leaderboard.sort((a, b) => b.score - a.score);
        leaderboard = leaderboard.slice(0, 10);
        
        localStorage.setItem('tetrisLeaderboard', JSON.stringify(leaderboard));
        this.updateLeaderboardDisplay();
        
        document.getElementById('gameOverModal').style.display = 'none';
        this.reset();
    }

    loadLeaderboard() {
        this.updateLeaderboardDisplay();
    }

    updateLeaderboardDisplay() {
        const leaderboard = JSON.parse(localStorage.getItem('tetrisLeaderboard') || '[]');
        const leaderboardElement = document.getElementById('leaderboardList');
        leaderboardElement.innerHTML = '';
        
        leaderboard.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            item.innerHTML = `
                <span>${index + 1}. ${entry.name}</span>
                <span>${entry.score}</span>
            `;
            leaderboardElement.appendChild(item);
        });
    }

    start() {
        if (this.gameLoop) clearInterval(this.gameLoop);
        this.gameLoop = setInterval(() => {
            if (!this.gameOver && !this.isPaused) {
                this.moveDown();
            }
        }, 1000);
    }
}

const game = new Tetris();
game.start();