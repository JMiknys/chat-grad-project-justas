/*globals socket, alert, console */
(function() {
    var app = angular.module("ChatApp", []);

    app.controller("ChatController", function($scope, $http) {
        $scope.loggedIn = false;

        // Array of users for new chat
        $scope.chat = [];

        // Thats where loaded conversations are stored
        $scope.conversations = [];

        $scope.onlineUsers = {};

        $http.get("/api/user").then(function(userResult) {
            $scope.loggedIn = true;
            $scope.user = userResult.data;

            // Register userID with the server
            socket.emit("register_user", $scope.user._id);

            $http.get("/api/users").then(function(result) {
                $scope.users = result.data;
            });
        }, function() {
            $http.get("/api/oauth/uri").then(function(result) {
                $scope.loginUri = result.data.uri;
            });
        });
        this.addToChat = function () {
            if ($scope.selectedUser) {
                var user = $scope.users.filter(function (u) {
                    return u.id === $scope.selectedUser;
                })[0];
                $scope.chat.push(user);
            }
        };
        this.startChat = function () {
            $scope.chat.unshift({id: $scope.user._id});
            var data = {};
            data.participants = $scope.chat.map(function (el) {
                return {id: el.id};
            });

            data.title = $scope.title;
            data.messages = [{sender: $scope.user._id, time: Date.now(), body: "Hello"}];

            socket.emit("new_conversation", data);
            //alert(JSON.stringify(data));

            $scope.title = "";
            $scope.chat = [];
        };

        this.sendMessage = function (conversation, msg) {
            var data = {};
            data.id = conversation;
            data.body = msg;
            data.sender = $scope.user._id;
            data.time = Date.now();
            socket.emit("message", data);

            // Remove input from textbox
            document.getElementById(conversation + "-input").value = "";
        };

        this.leaveConversation = function (conv_id) {
            var data = {};
            data.userId = $scope.user._id;
            data.conversation = conv_id;
            socket.emit("leaveConversation", data);
        };

        this.showOnline = function () {
            alert(JSON.stringify($scope.onlineUsers));
        };

        this.isOnline = function(userId) {
            if ($scope.onlineUsers[userId]) {
                return true;
            }
            return false;
        };

        this.getConversations = function () {
            socket.emit("init_conversations", $scope.user._id);
        };

        socket.on("init_conversations", function (msg) {
            $scope.conversations = msg;
            $scope.$apply();
            console.info(msg);
        });

        socket.on("message", function(msg) {
            console.log("Server received a new message: " + JSON.stringify(msg));
            // append message to correct conversation
            $scope.conversations.filter(function (conv) {
                return conv._id === msg.id;
            })[0].messages.push(msg);
            $scope.$apply();

            // scroll to bottom
            var div = document.getElementById(msg.id + "-messages");
            div.scrollTop = div.scrollHeight;
        });

        socket.on("users", function(data) {
            console.log("Received a list of users from server!");
            console.log(data);
            $scope.onlineUsers = data;
            $scope.$apply();
        });

        socket.on("user-disconnect", function (userId) {
            console.log("User disconnected. MSG: " + userId);
            delete $scope.onlineUsers[userId];
            $scope.$apply();
        });

        socket.on("user-connect", function (userId) {
            console.log("User connected. MSG: " + userId);
            $scope.onlineUsers[userId] = "online";
            $scope.$apply();
        });
    });
})();
