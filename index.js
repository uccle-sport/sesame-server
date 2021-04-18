const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 5000
const SECRET = process.env.SECRET || 'S3l3n1umSh@z@m'

const validateToken = (token) => SECRET === token
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});


function forward(action, token, callback) {
    if (validateToken(token)) {
        io.emit(action, {ts: +new Date()}, (response) => {
            callback({status: 200, response})
        })
    } else {
        callback({status: 403})
    }
}

io.on('connection', (socket) => {
    console.log('client connected');
    socket.on('open', ({token}, callback) => forward('open', token, callback));
    socket.on('close', ({token}, callback) => forward('close', token, callback));
    socket.on('ping', ({token}, callback) => forward('ping', token, callback));
    socket.on('disconnect', () => {
        console.log('client disconnected');
    });
});

http.listen(PORT, () => {
    console.log('listening on *:'+PORT);
});
