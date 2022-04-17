import { expect } from 'chai'

process.env.ANONYMOUS = 'false'

import {
	Response,
	ServerToClientEvents,
	ClientToServerEvents,
	GDS_SECRET,
	http,
	DEVICE_SECRET,
	SUPERUSER_SECRET,
} from '.'
import { io, Socket } from 'socket.io-client'
import { v4 as uuidV4 } from 'uuid'
import { retry, sleep } from './utils'

const token = GDS_SECRET
const deviceToken = DEVICE_SECRET

const deviceId = uuidV4()
const socketUrl = 'http://localhost:5000'
const pid = uuidV4()
const otherPid = uuidV4()
const yetAnotherPid = uuidV4()

const options = {
	transports: ['websocket'],
	forceNew: true,
}

let device: Socket<ServerToClientEvents, ClientToServerEvents>
let status = 'closed'
let keepOpenFor = 0

before(async () => {
	await retry(async () => {
		device = io(socketUrl, options)

		device.on(
			'close',
			({ token }: { token: string; uuid: string; pid: string }, callback?: Function) => {
				callback?.({ status: (status = 'closing') })
				setTimeout(() => (status = 'closed'), 1000)
			}
		)
		device.on(
			'open',
			({}: { token: string; uuid: string; pid: string }, callback?: Function) => {
				callback?.({ status: (status = 'opening') })
				setTimeout(() => (status = 'open'), 1000)
			}
		)
		device.on(
			'keepOpen',
			(
				{ duration }: { token: string; uuid: string; pid: string; duration: number },
				callback?: Function
			) => {
				callback?.({ status: (status = 'ok') })
				keepOpenFor = duration
			}
		)
		device.on(
			'ping',
			({}: { token: string; uuid: string; pid: string }, callback?: Function) => {
				callback?.({
					closed: status === 'closed',
					closing: status === 'closing',
					opening: status === 'opening',
					open: status === 'open',
					events: [],
				})
			}
		)

		await new Promise<Response>((resolve, reject) => {
			device.emit('register', { token: deviceToken, uuid: deviceId }, (res: Response) => {
				if (res.response.uuid === deviceId) {
					resolve(res)
				} else {
					reject('Cannot create remoteDevice')
				}
			})
		})
	})
})

describe('Main features', () => {
	it('can register phone', async () => {
		// the single test
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, options)
		const uuid = deviceId
		const response = await new Promise<Response>((resolve) => {
			socket.emit(
				'registerPid',
				{ token, pid, uuid, phone: '+32499534534', name: 'Dupont' },
				(res: Response) => {
					resolve(res)
				}
			)
		})
		expect(response.status).to.equal(200)
		expect(response.response.confirmed).to.equal(false)
	})

	it('can confirm phone', async () => {
		// the single test
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, options)
		const token = SUPERUSER_SECRET
		const uuid = deviceId
		expect(
			(
				await new Promise<Response>((resolve) => {
					socket.emit(
						'confirm',
						{ token, pid, uuid, confirmed: true },
						(res: Response) => {
							resolve(res)
						}
					)
				})
			).status
		).to.equal(200)
	})

	it('checks ping', async () => {
		// the single test
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, options)
		expect(
			(
				await new Promise<Response>((resolve) => {
					socket.emit('ping', { token, pid, uuid: deviceId }, (res: Response) => {
						resolve(res)
					})
				})
			).status
		).to.equal(200)
	})

	it('can open', async () => {
		// the single test
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, options)
		const uuid = deviceId
		const response = await new Promise<Response>((resolve) => {
			socket.emit('open', { token, pid, uuid }, () => {
				socket.emit('ping', { token, pid, uuid }, (res: Response) => {
					expect(res.status).to.equal(200)
					expect(res.response.opening).to.equal(true)
					sleep(1200).then(() => {
						socket.emit('ping', { token, pid, uuid }, (res: Response) => {
							resolve(res)
						})
					})
				})
			})
		})
		expect(response.status).to.equal(200)
		expect(response.response.open).to.equal(true)
	})

	it('can close', async () => {
		// the single test
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, options)
		const uuid = deviceId
		const response = await new Promise<Response>((resolve) => {
			socket.emit('close', { token, pid, uuid }, () => {
				socket.emit('ping', { token, pid, uuid }, (res: Response) => {
					expect(res.status).to.equal(200)
					expect(res.response.closing).to.equal(true)
					sleep(1200).then(() => {
						socket.emit('ping', { token, pid, uuid }, (res: Response) => {
							resolve(res)
						})
					})
				})
			})
		})
		expect(response.status).to.equal(200)
		expect(response.response.closed).to.equal(true)
	})

	it('has invitation', async () => {
		// the single test
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, options)
		const uuid = deviceId
		const response = await new Promise<Response>((resolve) => {
			socket.emit('invitations', { token, pid, uuid }, (res: Response) => {
				resolve(res)
			})
		})
		expect(response.status).to.equal(200)
		expect(response.response.length).to.equal(1)
	})

	it('can invite once', async () => {
		// the single test
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, options)
		const uuid = deviceId
		const invitations = await new Promise<Response>((resolve) => {
			socket.emit('invitations', { token, pid, uuid }, (res: Response) => {
				resolve(res)
			})
		})

		expect(invitations.status).to.equal(200)
		expect(invitations.response.length).to.equal(1)

		const anInvitationId = invitations.response[0]._id

		const response = await new Promise<Response>((resolve) => {
			socket.emit(
				'registerPid',
				{
					token,
					pid: otherPid,
					uuid,
					phone: '+32499534534',
					name: 'Dupont',
					invitation: anInvitationId,
				},
				(res: Response) => {
					resolve(res)
				}
			)
		})
		expect(response.status).to.equal(200)
		expect(response.response.confirmed).to.equal(true)

		const response2 = await new Promise<Response>((resolve) => {
			socket.emit(
				'registerPid',
				{
					token,
					pid: yetAnotherPid,
					uuid,
					phone: '+32499534534',
					name: 'Dupont',
					invitation: anInvitationId,
				},
				(res: Response) => {
					resolve(res)
				}
			)
		})
		expect(response2.status).to.equal(200)
		expect(response2.response.confirmed).to.equal(false)
	})

	it('has no more invitation', async () => {
		// the single test
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, options)
		const uuid = deviceId
		const response = await new Promise<Response>((resolve) => {
			socket.emit('invitations', { token, pid, uuid }, (res: Response) => {
				resolve(res)
			})
		})
		expect(response.status).to.equal(200)
		expect(response.response.length).to.equal(0)
	})
})

after(async () => {
	http.close()
})
