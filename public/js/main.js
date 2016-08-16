(function() {
    var app = angular.module("ChatApp", []);

    app.controller("ChatController", function($scope, $http) {
        $scope.loggedIn = false;

        // Array of users for new chat
        $scope.chat = [];

        // Thats where loaded conversations are stored
        $scope.conversations = [];

        $http.get("/api/user").then(function(userResult) {
            $scope.loggedIn = true;
            $scope.user = userResult.data;
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
            data.messages = [{sender: $scope.user._id, time: Date.now(), body: "Hello, I would like to start a conversation."}];

            socket.emit('new_conversation', data);
            alert(JSON.stringify(data));

            $scope.title = "";
            $scope.chat = [];
        };

        this.sendMessage = function (conversation, msg) {
            alert(conversation+ " ID. Trying to send message: "+msg);
        };

        this.getConversations = function () {
            socket.emit("init_conversations", $scope.user._id);
        };

        socket.on("init_conversations", function (msg) {
            $scope.conversations = msg;
            $scope.$apply();
            console.info(msg);
        });

        socket.on("response", function (msg) {
            console.info(msg);
        });
    });
})();
