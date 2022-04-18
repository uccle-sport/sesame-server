import * as express from 'express'
import * as NodeCache from 'node-cache'
import { v4 as uuidV4 } from 'uuid'
import * as PouchDB from 'pouchdb'
import * as PouchDBFind from 'pouchdb-find'

import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'

import FindRequest = PouchDB.Find.FindRequest

const PORT = process.env.PORT || 5000
const GDS_SECRET = process.env.GDS_SECRET || 'S3l3n1umSh@z@m'
const ANONYMOUS = process.env.ANONYMOUS !== 'false'
const SUPERUSER_SECRET = process.env.SUPERUSER_SECRET || 'S3l3n1umSh@z@m@br@c@d@br@'
const DEVICE_SECRET = process.env.GDS_SECRET || 'S3l3n1umSh@z@mH0cu5P0cu5'

PouchDB.plugin(PouchDBFind)

interface ServerToClientEvents {
	open: (
		msg: { ts: number; token: string; uuid: string; pid: string },
		callback?: Function
	) => void
	keepOpen: (
		msg: { ts: number; token: string; uuid: string; pid: string; duration: number },
		callback?: Function
	) => void
	close: (
		msg: { ts: number; token: string; uuid: string; pid: string },
		callback?: Function
	) => void
	ping: (
		msg: { ts: number; token: string; uuid: string; pid: string },
		callback?: Function
	) => void
	notify: (
		msg: { closed: boolean; open: boolean; opening: boolean; closing: boolean },
		callback?: Function
	) => void
}

interface ClientToServerEvents {
	register: (
		msg: { token: string; uuid: string; invitation?: string },
		callback?: Function
	) => void
	open: (msg: { token: string; uuid: string; pid: string }, callback?: Function) => void
	keepOpen: (
		msg: { token: string; uuid: string; pid: string; duration: number },
		callback?: Function
	) => void
	close: (msg: { token: string; uuid: string; pid: string }, callback?: Function) => void
	ping: (msg: { token: string; uuid: string; pid: string }, callback?: Function) => void
	notify: (msg: { token: string; uuid: string; msg: any }, callback?: Function) => void
	confirm: (
		msg: { token: string; uuid: string; pid: string; confirmed: boolean },
		callback?: Function
	) => void
	registerPid: (
		msg: {
			token: string
			uuid: string
			pid: string
			name: string
			phone: string
			invitation?: string
		},
		callback?: Function
	) => void
	invitations: (msg: { token: string; uuid: string; pid: string }, callback?: Function) => void
	rights: (msg: { token: string; uuid: string; pid: string }, callback?: Function) => void
	disconnect: () => void
}

interface Response {
	status: number
	response?: any
}

interface PhoneIdentifier {
	_id: string
	_rev: string
	uuid: string
	pid: string
	name: string
	phone: string
	canLock: boolean
	confirmed: boolean
}

interface Invitation {
	_id: string
	ts: number
}

const pidCache = new NodeCache({ stdTTL: 60 })
const app = express()
const http = new HttpServer(app)
const io = new Server<ClientToServerEvents, ServerToClientEvents, {}>(http, {
	cors: {
		origin: '*',
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		preflightContinue: false,
		optionsSuccessStatus: 204,
	},
})

const db = new PouchDB('https://rus:s3cur3dD00rF0rRUS@couch-cluster-02.icure.cloud/gdpi-rus')
db.createIndex({
	index: { fields: ['referrer', 'uuid', 'ts'] },
})
	.then(function () {
		console.log('Indexes created')
	})
	.catch(function (err) {
		console.error('Indexes error', JSON.stringify(err, null, ' '))
	})

console.log(`Secret is set to ${GDS_SECRET}`)
const garageDoors: {
	[key: string]: Socket<ClientToServerEvents, ServerToClientEvents, {}>
} = {}
const remotes: {
	[key: string]: Socket<ClientToServerEvents, ServerToClientEvents, {}>[]
} = {}

const validateToken = (token: string) =>
	GDS_SECRET === token || DEVICE_SECRET === token || SUPERUSER_SECRET === token
const validateDeviceToken = (token: string) => DEVICE_SECRET === token
const validateSuperToken = (token: string) => SUPERUSER_SECRET === token

async function confirmPid(
	uuid: string,
	pid: string,
	confirmed: boolean,
	callback: (response: Response) => void
) {
	console.log(`Confirming: ${uuid}, ${pid}`)
	const fullId = getFullId(uuid, pid)
	const doc = { ...(await db.get(fullId)), confirmed }
	const res = await db.put(doc)
	try {
		if (res.ok) {
			pidCache.set(fullId, { ...doc, _rev: res.rev })

			await db.put({
				_id: uuidV4(),
				uuid,
				referrer: pid,
				ts: +new Date(),
				type: 'invitation',
			})

			callback({ status: 200 })
		} else {
			callback({ status: 500 })
		}
	} catch (e) {
		callback({ status: 500 })
	}
}

app.use(express.static('public'))
app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Credentials', 'true')
	res.setHeader(
		'Access-Control-Allow-Headers',
		req.headers['access-control-request-headers'] || 'content-type, accept, authorization'
	)
	res.setHeader(
		'Access-Control-Allow-Methods',
		req.headers['access-control-request-method'] || 'GET, POST, DELETE, PUT, OPTIONS'
	)
	res.setHeader(
		'Access-Control-Allow-Origin',
		(req.headers.origin && req.headers.origin.toString()) ||
			req.headers['referer']?.replace(/(https?:\/\/.+?)\/.*/, '$1') ||
			'*'
	)
	if (req.method === 'OPTIONS') {
		res.sendStatus(200)
	} else {
		next()
	}
})

function getFullId(uuid: string, pid: string) {
	return `${uuid.replace(/[^0-9a-fA-F-]/g, '')}:${pid.replace(/[^0-9a-fA-F-]/g, '')}`
}

function pidFromDb(uuid: string, pid: string): Promise<PhoneIdentifier | null> {
	const fullId = getFullId(uuid, pid)
	const fromCache = pidCache.get<Promise<PhoneIdentifier | null>>(fullId)
	if (fromCache === undefined) {
		const fromDb: Promise<PhoneIdentifier> = db.get(fullId)
		const pidOrUndefined = fromDb.catch(() => null)
		pidCache.set(fullId, pidOrUndefined)
		return pidOrUndefined
	}
	return fromCache
}

async function isValid(uuid: string, pid: string, condition?: (x: PhoneIdentifier) => boolean) {
	try {
		const phone = (await pidFromDb(uuid, pid)) || { confirmed: false }
		return phone.confirmed && (!condition || condition(phone))
	} catch (e) {
		return false
	}
}

async function forward(
	action: 'open' | 'keepOpen' | 'close' | 'ping' | 'notify',
	token: string,
	uuid: string,
	pid: string | undefined,
	callback: (response: Response, callback?: Function) => void,
	msg?: any
) {
	if (validateToken(token) && pid && (ANONYMOUS || (await isValid(uuid, pid)))) {
		console.log(`Forwarding: ${uuid}, ${action}${msg ? ' < ' + JSON.stringify(msg) : ''}`)
		;(garageDoors[uuid] &&
			garageDoors[uuid].emit(action, { ts: +new Date(), ...(msg || {}) }, (response: any) => {
				callback({ status: 200, response })
			})) ||
			callback({ status: 404 })
	} else {
		callback({ status: 401 })
	}
}

async function confirm(
	token: string,
	uuid: string,
	pid: string,
	confirmed: boolean,
	callback: (response: Response, callback?: Function) => void
) {
	if (validateSuperToken(token)) {
		await confirmPid(uuid, pid, confirmed, callback)
	} else {
		callback({ status: 401 })
	}
}

async function registerPid(
	token: string,
	uuid: string,
	pid: string,
	name: string,
	phone: string,
	callback: (response: Response, callback?: Function) => void,
	invitation?: string
) {
	if (validateToken(token)) {
		try {
			console.log(`Registering pid: ${uuid}, ${pid}`)
			const fullId = getFullId(uuid, pid)
			const invitationDoc = invitation && (await db.get(invitation).catch(() => null))
			const {
				rev,
				phone: previousPhone,
				confirmed,
			} = await db
				.get<PhoneIdentifier>(fullId)
				.then((x) => ({ rev: x._rev, phone: x.phone, confirmed: x.confirmed }))
				.catch(() => ({ rev: undefined, phone: undefined, confirmed: undefined }))
			const doc = {
				_id: fullId,
				_rev: rev,
				uuid,
				pid,
				name,
				phone: confirmed ? previousPhone : phone,
				confirmed: !!invitationDoc,
				type: 'remote',
			}
			const res = await db.put(doc)
			if (res.ok) {
				const phoneDoc = { ...doc, _rev: res.rev }
				pidCache.set(fullId, phoneDoc)
				invitationDoc && (await db.put({ ...invitationDoc, _deleted: true }))
				callback({ status: 200, response: phoneDoc })
			} else {
				callback({ status: 500 })
			}
		} catch (e) {
			callback({ status: 500 })
		}
	} else {
		callback({ status: 401 })
	}
}

async function invitations(
	token: string,
	uuid: string,
	pid: string,
	callback: (response: Response, callback?: Function) => void
) {
	if (validateToken(token)) {
		try {
			const docs = (
				await db.find({
					selector: {
						referrer: pid,
						uuid: uuid,
					},
					limit: 10,
				})
			).docs
			callback({
				status: 200,
				response: docs,
			})
		} catch (e) {
			callback({ status: 500 })
		}
	} else {
		callback({ status: 401 })
	}
}

async function rights(
	token: string,
	uuid: string,
	pid: string,
	callback: (response: Response, callback?: Function) => void
) {
	if (validateToken(token)) {
		const fullId = getFullId(uuid, pid)
		const { canLock } = validateSuperToken(token)
			? { canLock: true }
			: await db.get<PhoneIdentifier>(fullId).catch(() => ({ canLock: false }))
		callback({
			status: 200,
			response: { canLock },
		})
	} else {
		callback({ status: 401 })
	}
}

async function connectDevice(
	token: string,
	uuid: string,
	pid: string | undefined,
	socket: Socket<ClientToServerEvents, ServerToClientEvents, {}>,
	callback?: (response: Response, callback?: Function) => void
) {
	if (validateDeviceToken(token)) {
		console.log(`Registering: ${uuid}`)
		garageDoors[uuid] = socket
		callback?.({ status: 200, response: { uuid } })
	} else if (pid && validateToken(token) && isValid(uuid, pid)) {
		console.log(`Registering: ${uuid}`)
		remotes[uuid] = (remotes[uuid] ?? []).concat(socket)
		callback?.({ status: 200, response: { uuid } })
	} else {
		console.log(`Registering: ${uuid} failed due to incorrect token`)
		callback?.({ status: 401 })
	}
}

async function openDoor(
	token: string,
	uuid: string,
	pid: string,
	callback: (response: Response, callback?: Function) => void
) {
	await forward('open', token, uuid, pid, callback)
	try {
		await db.put({ _id: uuidV4(), uuid, pid, ts: +new Date(), type: 'log' })
		const userInvitations = (
			(await db.find({
				selector: {
					referrer: pid,
					uuid: uuid,
				},
				limit: 2,
				sort: [{ ts: 'desc' }],
			} as FindRequest<Invitation>)) as PouchDB.Find.FindResponse<Invitation>
		).docs

		const lastInvitationTs = userInvitations.length ? userInvitations[0].ts : undefined
		if (lastInvitationTs && lastInvitationTs < +new Date() - 30 * 24 * 3600 * 1000) {
			const usage = (
				await db.find({
					selector: {
						pid: pid,
						uuid: uuid,
						type: 'log',
						ts: {
							$gt: +new Date() - 30 * 24 * 3600 * 1000,
						},
					},
					limit: 10,
				})
			).docs
			if (usage.length >= 4) {
				await db.put({
					_id: uuidV4(),
					uuid,
					referrer: pid,
					ts: +new Date(),
					type: 'invitation',
				})
			}
		}
	} catch (e) {
		console.error('Problem creating invitation', e)
	}
}

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, {}>) => {
	console.log('client connected')
	if (socket.handshake.query && socket.handshake.query.token) {
		connectDevice(
			socket.handshake.query.token as string,
			socket.handshake.query.uuid as string,
			socket.handshake.query.pid as string | undefined,
			socket
		).catch((e) => console.error(e))
	}
	socket.on('register', ({ token, uuid }: { token: string; uuid: string }, callback?: Function) =>
		connectDevice(
			token,
			uuid,
			undefined,
			socket,
			callback as (response: Response, callback?: Function) => void
		)
	)
	socket.on(
		'open',
		({ token, uuid, pid }: { token: string; uuid: string; pid: string }, callback?: Function) =>
			openDoor(
				token,
				uuid,
				pid,
				callback as (response: Response, callback?: Function) => void
			)
	)
	socket.on(
		'keepOpen',
		async (
			{
				token,
				uuid,
				pid,
				duration,
			}: { token: string; uuid: string; pid: string; duration: number },
			callback?: Function
		) =>
			(await isValid(uuid, pid, (phone) => phone.canLock)) &&
			forward(
				'keepOpen',
				token,
				uuid,
				pid,
				callback as (response: Response, callback?: Function) => void,
				{ duration }
			)
	)
	socket.on(
		'close',
		({ token, uuid, pid }: { token: string; uuid: string; pid: string }, callback?: Function) =>
			forward(
				'close',
				token,
				uuid,
				pid,
				callback as (response: Response, callback?: Function) => void
			)
	)
	socket.on(
		'ping',
		({ token, uuid, pid }: { token: string; uuid: string; pid: string }, callback?: Function) =>
			forward(
				'ping',
				token,
				uuid,
				pid,
				callback as (response: Response, callback?: Function) => void
			)
	)
	socket.on(
		'notify',
		({
			token,
			uuid,
			msg,
		}: {
			token: string
			uuid: string
			msg: { closed: boolean; open: boolean; opening: boolean; closing: boolean }
		}) => {
			if (msg && validateDeviceToken(token)) {
				remotes[uuid].forEach((r) => r.emit('notify', msg))
			}
		}
	)
	socket.on(
		'confirm',
		(
			{
				token,
				uuid,
				pid,
				confirmed,
			}: { token: string; uuid: string; pid: string; confirmed: boolean },
			callback?: Function
		) =>
			confirm(
				token,
				uuid,
				pid,
				confirmed,
				callback as (response: Response, callback?: Function) => void
			)
	)
	socket.on(
		'registerPid',
		(
			{
				token,
				uuid,
				pid,
				name,
				phone,
				invitation,
			}: {
				token: string
				uuid: string
				pid: string
				name: string
				phone: string
				invitation?: string
			},
			callback?: Function
		) =>
			registerPid(
				token,
				uuid,
				pid,
				name,
				phone,
				callback as (response: Response, callback?: Function) => void,
				invitation
			)
	)
	socket.on(
		'invitations',
		({ token, uuid, pid }: { token: string; uuid: string; pid: string }, callback?: Function) =>
			invitations(
				token,
				uuid,
				pid,
				callback as (response: Response, callback?: Function) => void
			)
	)
	socket.on(
		'rights',
		({ token, uuid, pid }: { token: string; uuid: string; pid: string }, callback?: Function) =>
			rights(token, uuid, pid, callback as (response: Response, callback?: Function) => void)
	)
})
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'))
app.post('/confirm', (req, res) => {
	const auth = req.headers.authorization && req.headers.authorization.substring('BASIC '.length)
	if (!auth) {
		res.status(401).send('Unauthorized')
		return
	}
	const buff = new Buffer(auth, 'base64')
	const [user, password] = buff.toString('ascii').split(':')
	if (user !== 'superuser' && password !== SUPERUSER_SECRET) {
		res.status(401).send('Unauthorized')
		return
	}

	confirmPid(req.body.uuid, req.body.pid, true, (response) => {
		res.status(response.status).send(response.status === 200 ? 'ok' : 'ko')
	}).catch(() => {
		res.status(500).send('Unexpected error')
	})
})

http.listen(PORT, () => {
	console.log('listening on *:' + PORT)
})

// Export our app for testing purposes
export {
	http,
	ServerToClientEvents,
	ClientToServerEvents,
	Response,
	GDS_SECRET,
	DEVICE_SECRET,
	SUPERUSER_SECRET,
}
