// Forest Surfer Application Script
document.addEventListener('DOMContentLoaded', () => {
    console.log('Forest Surfer initialized.');

    // --- Audio System (Procedural Haunted Ambience) ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let isMusicPlaying = false;
    let masterGain = null;
    let ambienceNodes = [];
    let schedulerTimer = null;

    // Scale: Harmonic Minor subset for creepiness (A, B, C, D#)
    const scale = [220, 246.94, 261.63, 311.13, 440, 493.88, 523.25, 622.25];

    // Initialize the audio graph
    const initAudio = () => {
        if (masterGain) return; // Already initialized

        // Master Gain (Volume Control)
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0; // Start silent
        masterGain.connect(audioCtx.destination);

        // --- Layer 1: Eerie Wind (Pink Noise) ---
        // Create Pink Noise Buffer (approx)
        const bufferSize = 2 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5; // Compensate for gain loss
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 400;

        // Modulate filter for "howling" wind
        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.15; // Slow howl
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 300; // Filter sweep range

        lfo.connect(lfoGain);
        lfoGain.connect(noiseFilter.frequency);

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.value = 0.08; // Background level

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);

        noise.start();
        lfo.start();
        ambienceNodes.push(noise, lfo);
    };

    // --- Layer 2: Random Broken Piano ---
    const playRandomNote = () => {
        if (!isMusicPlaying) return;

        const now = audioCtx.currentTime;

        // Schedule next note (random interval between 2s and 6s)
        const delay = 2 + Math.random() * 5;

        // Pick random frequency from scale
        const freq = scale[Math.floor(Math.random() * scale.length)];

        const osc = audioCtx.createOscillator();
        osc.type = 'triangle'; // Bell/Piano like
        osc.frequency.setValueAtTime(freq, now);

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.15, now + 0.1); // Attack
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 4); // Long Decay (Reverb-like)

        // Pan randomly
        const panner = audioCtx.createStereoPanner();
        panner.pan.value = Math.random() * 2 - 1;

        osc.connect(panner);
        panner.connect(gainNode);
        gainNode.connect(masterGain);

        osc.start(now);
        osc.stop(now + 4);

        // Recursive loop
        schedulerTimer = setTimeout(playRandomNote, delay * 1000);
    };

    const playMusic = () => {
        if (!masterGain) initAudio();

        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        // Fade in master
        const now = audioCtx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.linearRampToValueAtTime(0.8, now + 3);

        isMusicPlaying = true;

        // Start melody loop if not running
        if (!schedulerTimer) {
            playRandomNote();
        }
    };

    const stopMusic = () => {
        if (!masterGain) return;

        // Fade out
        const now = audioCtx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.linearRampToValueAtTime(0, now + 2);

        isMusicPlaying = false;
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
    };


    const introScene = document.getElementById('introScene');
    const homeScreen = document.getElementById('homeScreen');

    // Transition function to avoid code duplication
    const goToHome = () => {
        // Prevent multiple triggers
        if (introScene.classList.contains('fade-out')) return;

        console.log('Transitioning to Home...');
        introScene.classList.add('fade-out');

        // Check if music toggle is active by default and start music
        const musicToggleVal = document.getElementById('musicToggle');
        if (musicToggleVal) {
            const switchEl = musicToggleVal.querySelector('.toggle-switch');
            if (switchEl && switchEl.classList.contains('active')) {
                playMusic();
            }
        }

        // Show Home Screen after intro fades
        setTimeout(() => {
            homeScreen.classList.add('active');
        }, 800);
    };

    // 1. Touch/Click anywhere on the intro screen to skip
    if (introScene) {
        const handleIntroClick = (e) => {
            // If clicked on close button, don't go home yet (handled by close btn listener)
            if (e.target.closest('#closeBtn')) return;

            goToHome();
        };

        introScene.addEventListener('click', handleIntroClick);
        introScene.addEventListener('touchstart', handleIntroClick);
    }

    // 2. Auto-transition fallback (optional, can be longer now)
    setTimeout(() => {
        if (!introScene.classList.contains('fade-out')) {
            goToHome();
        }
    }, 4000);

    // --- Game Logic (Temple Run Mechanics) ---
    const startBtn = document.getElementById('startBtn');
    const gameLoader = document.getElementById('gameLoader');
    const loaderCount = document.getElementById('loaderCount');
    const gameScene = document.getElementById('gameScene');
    const runner = document.querySelector('.runner-container-game');
    const gameOverScreen = document.getElementById('gameOver');
    const restartBtn = document.getElementById('restartBtn');

    let score = 0;
    let scoreInterval = null;
    let obstacleInterval = null;
    let currentLane = 1; // 0: Left, 1: Center, 2: Right
    let isGameRunning = false;
    let isJumping = false;
    let isPaused = false;

    const moveLane = (dir) => {
        if (!isGameRunning) return;
        if (dir === 'left' && currentLane > 0) currentLane--;
        if (dir === 'right' && currentLane < 2) currentLane++;

        runner.className = `runner-container-game lane-${currentLane}${isJumping ? ' jumping' : ''}`;

        // Update CSS variable for jump animation to maintain X position
        const xPos = currentLane === 0 ? '-200%' : (currentLane === 1 ? '-50%' : '100%');
        runner.style.setProperty('--current-x', xPos);
    };

    const jump = () => {
        if (!isGameRunning || isJumping) return;
        isJumping = true;
        runner.classList.add('jumping');

        // Remove jumping class and reset flag after animation (0.6s)
        setTimeout(() => {
            runner.classList.remove('jumping');
            isJumping = false;
        }, 600);
    };

    const spawnObstacle = () => {
        if (!isGameRunning || isPaused) return;

        const lane = Math.floor(Math.random() * 3);
        const obstacle = document.createElement('div');
        obstacle.className = 'obstacle';
        obstacle.style.animation = 'obstacleApproach 1.8s linear forwards';

        // Match lane visually
        if (lane === 0) obstacle.style.marginLeft = '-150px';
        if (lane === 2) obstacle.style.marginLeft = '150px';

        gameScene.appendChild(obstacle);

        // Remove from DOM after animation
        obstacle.addEventListener('animationend', () => obstacle.remove());
    };

    const checkCollisions = () => {
        if (!isGameRunning || isPaused) return;

        const runnerRect = runner.getBoundingClientRect();
        const runnerBottom = runnerRect.bottom;

        const obstacles = document.querySelectorAll('.obstacle');
        obstacles.forEach(obstacle => {
            const obsRect = obstacle.getBoundingClientRect();

            // Precise Hitbox for the runner's silhouette (the boy's legs)
            const rHB = {
                left: runnerRect.left + runnerRect.width * 0.38,
                right: runnerRect.right - runnerRect.width * 0.38,
                top: runnerRect.top + runnerRect.height * 0.6,
                bottom: runnerRect.bottom - runnerRect.height * 0.02
            };

            // If visual overlap occurs
            if (rHB.left < obsRect.right &&
                rHB.right > obsRect.left &&
                rHB.top < obsRect.bottom &&
                rHB.bottom > obsRect.top) {

                // Only skip collision if we are jumping AND visually higher than the stone
                if (isJumping && (runnerBottom - 10) < obsRect.top) {
                    return;
                }

                console.log('Precision Hit!');
                triggerHitEffect();
                endGame();
            }
        });
    };

    const triggerHitEffect = () => {
        gameScene.classList.add('hit-shake');
        const flash = document.createElement('div');
        flash.className = 'damage-flash';
        document.body.appendChild(flash);

        setTimeout(() => {
            gameScene.classList.remove('hit-shake');
            if (flash.parentNode) flash.remove();
        }, 600);
    };

    const startScore = () => {
        const scoreEl = document.querySelector('.score');
        const update = () => {
            if (!isGameRunning || isPaused) return;
            score += 0.1; // Very slow scoring (approx 6 points per second)
            if (scoreEl) scoreEl.textContent = `Score: ${Math.floor(score)}`;

            checkCollisions(); // Real-time precision collision check

            scoreInterval = requestAnimationFrame(update);
        };
        scoreInterval = requestAnimationFrame(update);
    };

    const endGame = () => {
        isGameRunning = false;
        if (scoreInterval) cancelAnimationFrame(scoreInterval);
        clearInterval(obstacleInterval);

        if (gameOverScreen) {
            gameOverScreen.style.display = 'flex';
            gameOverScreen.querySelector('.final-score').textContent = `Final Score: ${Math.floor(score)}`;
        }
    };

    const restartGame = () => {
        score = 0;
        currentLane = 1;
        isGameRunning = true;
        isJumping = false;
        runner.className = `runner-container-game lane-1`;
        runner.style.setProperty('--current-x', '-50%'); // Reset X position variable

        if (gameOverScreen) gameOverScreen.style.display = 'none';
        document.querySelectorAll('.obstacle').forEach(o => o.remove());

        startScore();
        obstacleInterval = setInterval(spawnObstacle, 1200);
    };

    // Input Listeners
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a') moveLane('left');
        if (e.key === 'ArrowRight' || e.key === 'd') moveLane('right');
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') {
            e.preventDefault();
            jump();
        }
    });

    if (startBtn) {
        startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startBtn.style.display = 'none';
            if (gameLoader) {
                gameLoader.classList.add('active');
                let timeLeft = 3; // Faster loading
                loaderCount.textContent = timeLeft;

                const timer = setInterval(() => {
                    timeLeft--;
                    loaderCount.textContent = timeLeft;

                    if (timeLeft <= 0) {
                        clearInterval(timer);
                        setTimeout(() => {
                            if (homeScreen) {
                                homeScreen.style.opacity = '0';
                                homeScreen.style.pointerEvents = 'none';
                                if (gameScene) {
                                    gameScene.style.display = 'block';
                                    isGameRunning = true;
                                    scoreInterval = null; // Reset interval reference
                                    startScore();
                                    // Faster obstacle spawning
                                    obstacleInterval = setInterval(spawnObstacle, 1200);
                                }
                            }
                        }, 500);
                    }
                }, 1000); // 1 second per tick
            }
        });
    }

    // --- Pause Menu Implementation ---
    const pauseBtn = document.getElementById('pauseBtn');
    const pauseMenu = document.getElementById('pauseMenu');
    const resumeBtn = document.getElementById('resumeBtn');
    const pauseSettingsBtn = document.getElementById('pauseSettingsBtn');
    const quitBtn = document.getElementById('quitBtn');

    const togglePause = (shouldPause) => {
        if (!isGameRunning) return;
        isPaused = shouldPause;

        if (isPaused) {
            pauseMenu.classList.add('active');
            // Pause all CSS animations
            document.querySelectorAll('.obstacle, .road, .side-trees, .tree-layer').forEach(el => {
                el.style.animationPlayState = 'paused';
            });
            runner.style.animationPlayState = 'paused';
            if (runner.querySelector('.runner-svg')) {
                runner.querySelector('.runner-svg').style.animationPlayState = 'paused';
            }
        } else {
            pauseMenu.classList.remove('active');
            // Resume all CSS animations
            document.querySelectorAll('.obstacle, .road, .side-trees, .tree-layer').forEach(el => {
                el.style.animationPlayState = 'running';
            });
            runner.style.animationPlayState = 'running';
            if (runner.querySelector('.runner-svg')) {
                runner.querySelector('.runner-svg').style.animationPlayState = 'running';
            }
            // Resume the score loop
            startScore();
        }
    };

    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => togglePause(true));
    }

    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => togglePause(false));
    }

    const pauseHomeBtn = document.getElementById('pauseHomeBtn');
    const pauseQuitBtn = document.getElementById('pauseQuitBtn');
    const gameOverHomeBtn = document.getElementById('gameOverHomeBtn');

    if (pauseHomeBtn) {
        pauseHomeBtn.addEventListener('click', () => {
            if (confirm("Quit to Main Menu?")) {
                location.reload();
            }
        });
    }

    if (pauseQuitBtn) {
        pauseQuitBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to quit the application?")) {
                window.close();
                document.body.innerHTML = "<div style='color:white; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#000;'><h1>Game Closed</h1><p>You can close this tab now.</p></div>";
            }
        });
    }

    if (gameOverHomeBtn) {
        gameOverHomeBtn.addEventListener('click', () => {
            location.reload();
        });
    }

    if (restartBtn) {
        restartBtn.addEventListener('click', restartGame);
    }

    const closeBtn = document.getElementById('closeBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent it from triggering the scene click (which goes to home)
            console.log('Close clicked');
            if (confirm("Are you sure you want to quit?")) {
                window.close();
                document.body.innerHTML = "<div style='color:white; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;'><h1>Game Closed</h1><p>You can close this tab now.</p></div>";
            }
        });
    }



    // --- Settings Menu Logic ---
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');

    const musicToggle = document.getElementById('musicToggle');
    const soundToggle = document.getElementById('soundToggle');
    const ctrlTouch = document.getElementById('ctrlTouch');
    const ctrlGyro = document.getElementById('ctrlGyro');

    // Open Settings
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsModal.classList.add('active');
        });
    }

    // Close Settings (Select)
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            if (settingsModal) settingsModal.classList.remove('active');
            // Save settings logic here if needed
            console.log('Settings saved');
        });
    }

    // Music Toggle
    if (musicToggle) {
        musicToggle.addEventListener('click', () => {
            const switchEl = musicToggle.querySelector('.toggle-switch');
            switchEl.classList.toggle('active');
            const isActive = switchEl.classList.contains('active');
            console.log('Music:', isActive ? 'ON' : 'OFF');

            if (isActive) {
                playMusic();
            } else {
                stopMusic();
            }
        });
    }

    // Sound Toggle
    if (soundToggle) {
        soundToggle.addEventListener('click', () => {
            const switchEl = soundToggle.querySelector('.toggle-switch');
            switchEl.classList.toggle('active');
            const isActive = switchEl.classList.contains('active');
            console.log('Sound:', isActive ? 'ON' : 'OFF');
        });
    }

    // Controls Selection
    if (ctrlTouch && ctrlGyro) {
        ctrlTouch.addEventListener('click', () => {
            ctrlTouch.classList.add('selected');
            ctrlGyro.classList.remove('selected');
            console.log('Control Mode: Touch');
        });

        ctrlGyro.addEventListener('click', () => {
            ctrlGyro.classList.add('selected');
            ctrlTouch.classList.remove('selected');
            console.log('Control Mode: Gyro');
        });
    }
});
