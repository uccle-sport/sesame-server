import './style.css'
import { Socket } from 'socket.io-client'
export declare class Sesame {
	socket: Socket
	params: URLSearchParams | undefined
	connected: boolean
	d: Date | undefined
	startOfAction: number
	opening: boolean
	closing: boolean
	open: boolean
	closed: boolean
	init(): void
	private followUpOpeningProgress
	private followUpClosingProgress
	private setProgress
	toggle(): void
	openDoor(): void
	closeDoor(): void
	keepOpen(duration: number): void
	showSettings(): void
	hideSettings(): void
}
export declare const sesame: Sesame
