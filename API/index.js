const express = require("express");
const socketio = require("socket.io");
const http = require("http");
const cors = require("cors");
const login = require("./routes/login");
const newuser = require("./routes/newuser");
const project = require("./routes/project");
const mongoose = require("mongoose");
const request = require("request");

const PORT = process.env.PORT || 5000;
const MONGODB_PATH =
  process.env.mongoDB_Path || "mongodb://localhost:27017/wede";

const router = require("./router");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

mongoose
  .connect(MONGODB_PATH, {
    useCreateIndex: true,
    useFindAndModify: false,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    server.listen(PORT, () =>
      console.log(`server has started on port ${PORT}`)
    );
  });

const { addUser, getUser, getUsersInRoom, removeUser } = require("./users.js");

app.use(cors());
app.use(router);
app.use(express.json());
app.use("/login", login);
app.use("/newuser", newuser);
app.use("/project", project);
app.use(router);

io.on("connection", (socket) => {
  socket.on("join", ({ name, room, projectName }, callback) => {
    const { error, user } = addUser({ id: socket.id, name, room });

    if (error) return callback(error);

    socket.emit("message", {
      user: "admin",
      text: `${user.name} welcome to project: " ${projectName} " chat`,
    });
    socket.broadcast
      .to(user.room)
      .emit("message", { user: "admin", text: `${user.name} joined the room` });
    socket.join(user.room);

    io.to(user.room).emit("roomData", {
      room: user.room,
      users: getUsersInRoom(user.room),
    });

    callback();
  });

  socket.on("sendMessage", (message, callback) => {
    const user = getUser(socket.id);

    io.to(user.room).emit("message", { user: user.name, text: message });
    //io.to(user.room).emit('roomData',{user : user.room , text : message});
    callback();
  });

  socket.on("disconnect", () => {
    const user = removeUser(socket.id);

    if (user) {
      io.to(user.room).emit("message", {
        user: "admin",
        text: `${user.name} has left.`,
      });
      io.to(user.room).emit("roomData", {
        room: user.room,
        users: getUsersInRoom(user.room),
      });
    }
  });

  socket.on("editor change", (value) => {
    socket.broadcast
      .to(value.currentProjectID + "editor")
      .emit("remote editor change", value.value);
  });

  socket.on("editor join", (value) => {
    console.log(value.userName + " joined: " + value.currentProjectID);
    socket.join(value.currentProjectID + "editor");
    if (
      io.sockets.adapter.rooms[value.currentProjectID + "editor"].length === 1
    ) {
      // Ask front end to fetch code from database
      socket.emit("database fetch");
      console.log("database fetch for " + value.currentProjectID + "editor");
    } else {
      // console.log("remit for " + value.currentProjectID + "editor");
      socket.broadcast.to(value.currentProjectID + "editor").emit("remit");
    }
  });
});
