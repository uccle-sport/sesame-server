const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 5000

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('client connected');
    socket.on('click', (msg) => {
        io.emit('clicked', msg);
    });
    socket.on('disconnect', () => {
        console.log('Garagedoor disconnected');
    });
});

http.listen(PORT, () => {
    console.log('listening on *:'+PORT);
});
