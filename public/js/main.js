/*globals io, alert, prompt, console */
(function() {
    var app = angular.module("ChatApp", []);

    app.controller("ChatController", function($scope, $http) {
        var self = this;
        console.log(window.location.protocol + "//" + window.location.host);
        var socket = io();
        $scope.loggedIn = false;

        //$scope.color = "lightgrey";

        // Array of users for new chat
        $scope.chat = [];

        // Thats where loaded conversations are stored
        $scope.conversations = [];

        // Store user profiles of others
        $scope.userProfiles = [];

        $scope.onlineUsers = [];

        $scope.selectedConversation = -1;

        $http.get("/api/user").then(function(userResult) {
            $scope.loggedIn = true;
            $scope.user = userResult.data;
            console.log(userResult.data);

            // Register userID with the server
            socket.emit("register_user", $scope.user._id);

            $http.get("/api/users").then(function(result) {
                $scope.users = result.data;
            });
            self.getConversations();
            //self.getUserProfiles();
        }, function() {
                $http.get("/api/oauth/uri").then(function(result) {
                    $scope.loginUri = result.data.uri;
                });
            });
        this.setConversation = function (index) {
            $scope.selectedConversation = index;

            if ($scope.conversations[index].unread > 0) {
                $scope.conversations[index].unread = 0;
            }
            self.adjustScrollBar();
        };
        this.adjustScrollBar = function () {
            // When conversation initialised scroll to the bottom
            setTimeout(function () {
                var div = document.getElementById("conversation-container");
                div.scrollTop = div.scrollHeight;
            }, 10);
        };
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

            data.title = $scope.title !== "" ? $scope.title : "Conversation";
            data.messages = [{sender: $scope.user._id, time: Date.now(), body: "Hello"}];

            socket.emit("new_conversation", data);
            //alert(JSON.stringify(data));

            $scope.title = "";
            $scope.chat = [];
        };

        this.sendMessage = function () {
            //e.preventDefault();
            //alert("Message: "+$scope.newMessage);

            var data = {};
            data.id = $scope.conversations[$scope.selectedConversation]._id;
            data.body = $scope.newMessage;
            data.sender = $scope.user._id;
            data.time = Date.now();
            socket.emit("message", data);

            // Remove input from textbox
            //document.getElementById(conversation + "-input").value = "";
            $scope.newMessage = "";
        };

        this.leaveConversation = function (conversation) {
            var data = {};
            data.userId = $scope.user._id;
            data.conversation = conversation._id;
            socket.emit("leaveConversation", data);
        };

        this.showOnline = function () {
            alert(JSON.stringify($scope.onlineUsers));
        };

        this.isOnline = function(userId) {
            var result;
            $scope.onlineUsers.forEach(function (el, i) {
                if (userId === el._id) {
                    result = $scope.onlineUsers[i].online;
                }
            });
            return result;
        };

        this.getUserColor = function (userId) {
            var result;
            $scope.onlineUsers.forEach(function (el, i) {
                if (userId === el._id) {
                    result = $scope.onlineUsers[i].color;
                }
            });
            if (!result) {
                result = "#d3d3d3";
            }
            return result;
        };

        this.getUserImage = function (userId) {
            var result;
            $scope.onlineUsers.forEach(function (el, i) {
                if (userId === el._id) {
                    result = $scope.onlineUsers[i].avatarUrl;
                }
            });
            if (!result) {
                result = $scope.user.avatarUrl;
            }
            return result;
        };

        this.saveUserProfile = function () {
            var userProfile = {};
            userProfile.id = $scope.user._id;
            userProfile.name = document.getElementById("name").value;
            userProfile.avatarUrl = document.getElementById("avatar").value;
            userProfile.color = document.getElementById("color").value;
            // Update profile for local client
            var index;
            $scope.onlineUsers.forEach(function (el, i) {
                if ($scope.user._id === el._id) {
                    index = i;
                }
            });
            $scope.onlineUsers[index].name = userProfile.name;
            $scope.onlineUsers[index].avatarUrl = userProfile.avatarUrl;
            $scope.onlineUsers[index].color = userProfile.color;
            socket.emit("update-profile", userProfile);
        };

        this.getConversations = function () {
            socket.emit("init_conversations", $scope.user._id);
            console.log("get conversations is called");
        };

        this.clearConversation = function () {
            $scope.conversations[$scope.selectedConversation].messages = [];
        };

        this.changeTopic = function () {
            var topic = prompt("Enter a new topic for '" + $scope.conversations[$scope.selectedConversation].title +
            "' conversation.");
            var data = {};
            data.id = $scope.conversations[$scope.selectedConversation]._id;
            data.topic = topic;
            console.log(data);
            socket.emit("change-topic", data);
        };

        this.notify = function (title, body) {
            var options = {
                body: body
            };
            var notification = new Notification(title, options);
        };
        this.addUsersToConversation = function () {
            var form = document.getElementById("addUsers-form");
            var inputs = form.getElementsByTagName("input");

            var data = {};
            data.participants = [];

            for (var i = 0, length = inputs.length; i < length; i++) {
                if (inputs[i].type === "checkbox" && inputs[i].checked === true) {
                    console.log("Checkbox found: " + inputs[i].value);
                    data.participants.push({id: inputs[i].value});
                }
            }
            data.id = $scope.conversations[$scope.selectedConversation]._id;
            socket.emit("add-more-users", data);
        };

        socket.on("init_conversations", function (msg) {
            $scope.conversations = msg;
            $scope.$apply();
            console.info(msg);
        });

        socket.on("new_conversation", function (conversation) {
            $scope.conversations.push(conversation);
            var index = $scope.conversations.indexOf(conversation);

            $scope.conversations[index].unread = 1;

            $scope.$apply();
            console.log("New conversation initiated!");
        });

        socket.on("leave-conversation", function (data) {
            if (data.userId === $scope.user._id) {
                $scope.conversations.forEach(function (c, i) {
                    if (c._id === data.conversation) {
                        $scope.conversations.splice(i, 1);
                        $scope.$apply();
                    }
                });
            }
        });

        socket.on("user-joined", function(conversation) {
            console.log("Got message about people joining!");
            console.log(conversation);
            var index = -1;
            $scope.conversations.forEach(function (el, i) {
                if (el._id === conversation._id) {
                    index = i;
                }
            });
            if (index >= 0) {
                $scope.conversations[index].participants = conversation.participants;
            }
            else {
                self.notify("New conversation", "You have been added to a conversation");
                console.log("This runs only for new person");
                $scope.conversations.push(conversation);
            }
            $scope.$apply();
        });

        socket.on("message", function(msg) {
            // append message to correct conversation
            var conversation = $scope.conversations.filter(function (conv) {
                return conv._id === msg.id;
            })[0];
            var index = $scope.conversations.indexOf(conversation);
            conversation.messages.push(msg);

            /* TODO: PUTTING MESSAGE AT TOP CAUSES TOO MUCH PROBLEMS
            // If the message don't come from same user, put conversationw ith newest message at top
            if (msg.sender !== $scope.users._id && index !== 0) {
                $scope.conversations.splice(index);
                $scope.conversations.unshift(conversation);
                //$scope.$apply();
            }
            */
            if (msg.sender !== "Server" && msg.sender !== $scope.user._id) {
                self.notify("New message received", "Message from " + msg.sender);
            }

            // Add to unread messages if window is closed

            if (typeof $scope.selectedConversation === "undefined" ||
                $scope.conversations[$scope.selectedConversation]._id !== msg.id) {
                $scope.conversations[index].unread = $scope.conversations[index].unread + 1 || 1;
            }
            else {
                self.adjustScrollBar();
            }

            $scope.$apply();
        });

        socket.on("users", function(data) {
            console.log("Received a list of users from server!");
            $scope.onlineUsers = data;
            $scope.$apply();
        });

        socket.on("user-update", function (userData) {
            console.info("Another user updated his profile. MSG: " + JSON.stringify(userData));
            var index;
            $scope.onlineUsers.forEach(function (el, i) {
                if (el._id === userData._id) {
                    index = i;
                }
            });
            $scope.onlineUsers[index] = userData;
            $scope.$apply();
        });
        socket.on("change-topic", function (data) {
            var index;
            $scope.conversations.forEach(function (el, i) {
                if (el._id === data.id) {
                    index = i;
                }
            });
            $scope.conversations[index].title = data.topic;
            $scope.$apply();
        });
    });
})();
