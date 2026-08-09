import StartGame from './game/main';
import type { Game } from 'phaser';

let activeGame: Game | undefined;

function bootGame() {
    activeGame = StartGame('game-container');
}


document.addEventListener('DOMContentLoaded', () => {
    bootGame();

});
