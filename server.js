const cors = require("cors");
const path = require("path");
const cookie = require("cookie");
const dotenv = require("dotenv");
const express = require("express");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { createServer } = require("http");
const { isAuth } = require("./lib/token");
const { getUser } = require("./lib/utils");
const authRouter = require("./routes/auth");
const Message = require("./models/message");
const cookieParser = require("cookie-parser");

dotenv.config();
const app = express();
const server = createServer(app);

mongoose.connect(process.env.DATABASE_URL, () =>
    console.log("connected to db")
);

app.use(cookieParser());
app.use(express.json(), cors());
app.use(express.urlencoded({ extended: false }));

// setting the view engine
app.set("view engine", "ejs");

// setting public files
app.use(express.static("public"));
app.use(express.static("public/js"));
app.use(express.static("public/css"));
app.use(express.static("public/assets"));

// rendrering views according to path
app.use(function (req, res, next) {
    response = res;
    if (req.path.includes("chat"))
        app.set("views", path.join(__dirname, "views/components"));
    else app.set("views", path.join(__dirname, "views/auth"));
    next();
});

// routes
app.use("/", authRouter);
app.get("/chat", isAuth, (req, res) => {
    res.render("chat");
});

app.post("/chat", isAuth, (req, res) => {
    res.render("chat");
});

app.get("/profile", isAuth, (req, res) => {
    const user = getUser(req.cookies);
    if (!user) return res.json({ error: true });
    return res.json({ user: user });
});

var onlineUsers = [];
var cacheOnlineUsers = new Map();

/* logic */
const io = new Server(server);
io.on("connection", async (socket) => {
    console.log(onlineUsers);
    /* sending online users to connected ones */
    const cookies = cookie.parse(socket.handshake.headers.cookie);
    let user = getUser(cookies, socket);
    // preventing to add same user to onlineUsers when refreshing the page
    if (typeof cacheOnlineUsers.get(user._id) === "undefined") {
        onlineUsers.push(user);
        cacheOnlineUsers.set(user._id, user);
    } else {
        updateUser(user);
    }
    // sending user info to the connected user
    io.to(socket.id).emit("user", user);

    // sending online users to all connected clients
    socket.on("req-onlineUsers", (user) => {
        io.emit("onlineUsers", onlineUsers);
    });

    /* removing user from online users on logout */
    socket.on("logout", () => {
        onlineUsers = onlineUsers.filter((u) => u.socketID != socket.id);
        io.emit("onlineUsers", onlineUsers);
    });

    /* sending to msg to a user */
    socket.on("to-receiver", async (text, receiverID) => {
        let message = "";
        let sender = onlineUsers.filter((u) => u.socketID == socket.id)[0];
        let receiver = onlineUsers.filter((u) => u.socketID == receiverID)[0];
        message = new Message({
            sender: sender,
            receiver: receiver,
            text: text,
        });
        io.to(receiverID).emit("to-receiver", message);
        message = await message.save();
    });

    // load msgs when clicking an online user
    socket.on("load-msgs", async (receiverID) => {
        let messages = [];
        let sender = onlineUsers.filter((u) => u.socketID == socket.id)[0];
        let receiver = onlineUsers.filter((u) => u.socketID == receiverID)[0];
        messages = await Message.find({
            $or: [
                { "sender._id": sender._id, "receiver._id": receiver._id },
                { "sender._id": receiver._id, "receiver._id": sender._id },
            ],
        });
        socket.emit("load-msgs", messages, sender, receiver);
    });
});

const updateUser = (user) => {
    var index = onlineUsers.findIndex((x) => x._id == user._id);
    onlineUsers[index] = user;
    cacheOnlineUsers.set(user._id, user);
};

server.listen(5000);
