const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 5000
const GDS_SECRET = process.env.GDS_SECRET || 'S3l3n1umSh@z@m'

console.log(`Secret is set to ${GDS_SECRET}`)
const allowedStaticFiles = ['/index.html','/favicon.ico','/apple-touch-icon.png']
const garageDoors = {}

const validateToken = (token) => GDS_SECRET === token

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'))
allowedStaticFiles.forEach(f => app.get(f, (req, res) => res.sendFile(__dirname + f)))

function forward(action, uuid, token, callback, msg) {
    if (validateToken(token)) {
        console.log(`Forwarding: ${uuid}, ${action}${msg?' < '+JSON.stringify(msg):''}`);
        garageDoors[uuid] && garageDoors[uuid].emit(action, {ts: +new Date(), ...(msg || {})}, (response) => {
            callback({status: 200, response})
        }) || callback({status: 404})
    } else {
        callback({status: 401})
    }
}

function register(token, uuid, socket, uuids) {
    if (validateToken(token)) {
        console.log(`Registering: ${uuid}`);
        garageDoors[uuid] = socket
        uuids.push(uuid)
    } else {
        console.log(`Registering: ${uuid} failed due to incorrect token`);
    }
}

io.on('connection', (socket) => {
    let uuids = []
    console.log('client connected');
    if (socket.handshake.query && socket.handshake.query.token) { register(socket.handshake.query.token, socket.handshake.query.uuid, socket, uuids) }
    socket.on('register', ({token, uuid}, callback) => { register(token, uuid, socket, uuids) })
    socket.on('open', ({token, uuid}, callback) => forward('open', uuid, token, callback));
    socket.on('keepOpen', ({token, uuid, duration}, callback) => forward('keepOpen', uuid, token, callback, {duration}));
    socket.on('close', ({token, uuid}, callback) => forward('close', uuid, token, callback));
    socket.on('ping', ({token, uuid}, callback) => forward('ping', uuid, token, callback));

    socket.on('disconnect', () => {
        console.log('client disconnected');
        uuids.forEach(it => {delete garageDoors[it]})
    });
});

http.listen(PORT, () => {
    console.log('listening on *:'+PORT);
});
