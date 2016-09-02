var server = require("../server/server");
var request = require("request");
var assert = require("chai").assert;
var sinon = require("sinon");
var io = require("socket.io-client");
var MongoClient = require("mongodb").MongoClient;

var testPort = 52684;
var baseUrl = "http://localhost:" + testPort;
var oauthClientId = "1234clientId";

var testUser = {
    _id: "bob",
    name: "Bob Bilson",
    avatarUrl: "http://avatar.url.com/u=test"
};
var testUser2 = {
    _id: "charlie",
    name: "Charlie Colinson",
    avatarUrl: "http://avatar.url.com/u=charlie_colinson"
};
var testGithubUser = {
    login: "bob",
    name: "Bob Bilson",
    avatar_url: "http://avatar.url.com/u=test"
};
var testToken = "123123";
var testExpiredToken = "987978";

describe("server", function() {
    var cookieJar;
    var db;
    var githubAuthoriser;
    var serverInstance;
    var dbCollections;
    // var callback = sinon.spy();
    beforeEach(function() {
        cookieJar = request.jar();
        dbCollections = {
            users: {
                find: sinon.stub().returns({
                    toArray: sinon.spy(function(callback) {
                        return callback(null, [testUser, testUser2]);
                    })
                }),
                findOne: sinon.stub(),
                insertOne: sinon.spy(),
                updateOne: sinon.stub()
            }
        };
        db = {
            collection: sinon.stub()
        };
        db.collection.withArgs("users").returns(dbCollections.users);

        githubAuthoriser = {
            authorise: function() {},
            oAuthUri: "https://github.com/login/oauth/authorize?client_id=" + oauthClientId
        };
        serverInstance = server(testPort, db, githubAuthoriser);
    });
    afterEach(function() {
        serverInstance.close();
    });
    function authenticateUser(user, token, callback) {
        sinon.stub(githubAuthoriser, "authorise", function(req, authCallback) {
            authCallback(user, token);
        });

        dbCollections.users.findOne.callsArgWith(1, null, user);

        request(baseUrl + "/oauth", function(error, response) {
            cookieJar.setCookie(request.cookie("sessionToken=" + token), baseUrl);
            callback();
        });
    }
    describe("GET /oauth", function() {
        var requestUrl = baseUrl + "/oauth";

        it("responds with status code 400 if oAuth authorise fails", function(done) {
            var stub = sinon.stub(githubAuthoriser, "authorise", function(req, callback) {
                callback(null);
            });

            request(requestUrl, function(error, response) {
                assert.equal(response.statusCode, 400);
                done();
            });
        });
        it("responds with status code 302 if oAuth authorise succeeds", function(done) {
            var user = testGithubUser;
            var stub = sinon.stub(githubAuthoriser, "authorise", function(req, authCallback) {
                authCallback(user, testToken);
            });

            dbCollections.users.findOne.callsArgWith(1, null, user);

            request({url: requestUrl, followRedirect: false}, function(error, response) {
                assert.equal(response.statusCode, 302);
                done();
            });
        });
        it("responds with a redirect to '/' if oAuth authorise succeeds", function(done) {
            var user = testGithubUser;
            var stub = sinon.stub(githubAuthoriser, "authorise", function(req, authCallback) {
                authCallback(user, testToken);
            });

            dbCollections.users.findOne.callsArgWith(1, null, user);

            request(requestUrl, function(error, response) {
                assert.equal(response.statusCode, 200);
                assert.equal(response.request.uri.path, "/");
                done();
            });
        });
        it("add user to database if oAuth authorise succeeds and user id not found", function(done) {
            var user = testGithubUser;
            var stub = sinon.stub(githubAuthoriser, "authorise", function(req, authCallback) {
                authCallback(user, testToken);
            });

            dbCollections.users.findOne.callsArgWith(1, null, null);

            request(requestUrl, function(error, response) {
                assert(dbCollections.users.insertOne.calledOnce);
                assert.deepEqual(dbCollections.users.insertOne.firstCall.args[0], {
                    _id: "bob",
                    name: "Bob Bilson",
                    avatarUrl: "http://avatar.url.com/u=test",
                    color: "#D3D3D3"
                });
                done();
            });
        });
    });
    describe("GET /api/oauth/uri", function() {
        var requestUrl = baseUrl + "/api/oauth/uri";
        it("responds with status code 200", function(done) {
            request(requestUrl, function(error, response) {
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("responds with a body encoded as JSON in UTF-8", function(done) {
            request(requestUrl, function(error, response) {
                assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
                done();
            });
        });
        it("responds with a body that is a JSON object containing a URI to GitHub with a client id", function(done) {
            request(requestUrl, function(error, response, body) {
                assert.deepEqual(JSON.parse(body), {
                    uri: "https://github.com/login/oauth/authorize?client_id=" + oauthClientId
                });
                done();
            });
        });
    });
    describe("GET /api/user", function() {
        var requestUrl = baseUrl + "/api/user";
        it("responds with status code 401 if user not authenticated", function(done) {
            request(requestUrl, function(error, response) {
                assert.equal(response.statusCode, 401);
                done();
            });
        });
        it("responds with status code 401 if user has an unrecognised session token", function(done) {
            cookieJar.setCookie(request.cookie("sessionToken=" + testExpiredToken), baseUrl);
            request({url: requestUrl, jar: cookieJar}, function(error, response) {
                assert.equal(response.statusCode, 401);
                done();
            });
        });
        it("responds with status code 200 if user is authenticated", function(done) {
            authenticateUser(testUser, testToken, function() {
                request({url: requestUrl, jar: cookieJar}, function(error, response) {
                    assert.equal(response.statusCode, 200);
                    done();
                });
            });
        });
        it("responds with a body that is a JSON representation of the user if user is authenticated", function(done) {
            authenticateUser(testUser, testToken, function() {
                request({url: requestUrl, jar: cookieJar}, function(error, response, body) {
                    assert.deepEqual(JSON.parse(body), {
                        _id: "bob",
                        name: "Bob Bilson",
                        avatarUrl: "http://avatar.url.com/u=test"
                    });
                    done();
                });
            });
        });
        it("responds with status code 500 if database error", function(done) {
            authenticateUser(testUser, testToken, function() {

                dbCollections.users.findOne.callsArgWith(1, {err: "Database error"}, null);

                request({url: requestUrl, jar: cookieJar}, function(error, response) {
                    assert.equal(response.statusCode, 500);
                    done();
                });
            });
        });
    });
    describe("GET /api/users", function() {
        var requestUrl = baseUrl + "/api/users";
        var allUsers;
        beforeEach(function() {
            allUsers = {
                toArray: sinon.stub()
            };
            dbCollections.users.find.returns(allUsers);
        });
        it("responds with status code 401 if user not authenticated", function(done) {
            request(requestUrl, function(error, response) {
                assert.equal(response.statusCode, 401);
                done();
            });
        });
        it("responds with status code 401 if user has an unrecognised session token", function(done) {
            cookieJar.setCookie(request.cookie("sessionToken=" + testExpiredToken), baseUrl);
            request({url: requestUrl, jar: cookieJar}, function(error, response) {
                assert.equal(response.statusCode, 401);
                done();
            });
        });
        it("responds with status code 200 if user is authenticated", function(done) {
            authenticateUser(testUser, testToken, function() {
                allUsers.toArray.callsArgWith(0, null, [testUser]);

                request({url: requestUrl, jar: cookieJar}, function(error, response) {
                    assert.equal(response.statusCode, 200);
                    done();
                });
            });
        });
        it("responds with a body that is a JSON representation of the user if user is authenticated", function(done) {
            authenticateUser(testUser, testToken, function() {
                allUsers.toArray.callsArgWith(0, null, [
                        testUser,
                        testUser2
                    ]);

                request({url: requestUrl, jar: cookieJar}, function(error, response, body) {
                    assert.deepEqual(JSON.parse(body), [
                        {
                            id: "bob",
                            name: "Bob Bilson",
                            avatarUrl: "http://avatar.url.com/u=test"
                        },
                        {
                            id: "charlie",
                            name: "Charlie Colinson",
                            avatarUrl: "http://avatar.url.com/u=charlie_colinson"
                        }
                    ]);
                    done();
                });
            });
        });
        it("responds with status code 500 if database error", function(done) {
            authenticateUser(testUser, testToken, function() {
                allUsers.toArray.callsArgWith(0, {err: "Database failure"}, null);

                request({url: requestUrl, jar: cookieJar}, function(error, response) {
                    assert.equal(response.statusCode, 500);
                    done();
                });
            });
        });
    });

    describe("Socket test", function () {
        var mongoDb;
        var mongoServer;
        var client1;
        var client2;
        var conversations;
        before(function (done) {
            MongoClient.connect("mongodb://justas:justas@ds021326.mlab.com:21326/chat", function(err, mongo) {
                if (err) {
                    console.log("Failed to connect to db", err);
                    return;
                }
                mongoDb = mongo;
                mongoDb.collection("users").insertOne(testUser);
                mongoDb.collection("users").insertOne(testUser2);

                mongoServer = server(52685, mongoDb, githubAuthoriser);
                setTimeout(function() {
                    done();
                }, 1000);
                //done();
            });
        });
        beforeEach(function(done) {
            done();
        });
        afterEach(function() {

        });
        after(function() {
            mongoDb.dropDatabase();
            mongoServer.close();
        });

        it("Connecting and register user", function(done) {
            //var spy = sinon.spy(serverInstance, "addClient");
            client1 = io.connect("http://localhost:52685");
            client2 = io.connect("http://localhost:52685");
            //assert(spy.calledOnce);

            /*
            client.on("users", function (data) {
                console.log("Success?");
            });
            var serverMessage;
            client.on("new_conversation", function (smsg) {
                serverMessage = smsg;
            });

            var profile = {};
            profile.id = "bob";
            profile.avatarUrl = testGithubUser.avatar_url;
            profile.color = "#D3D3D3";
            client.emit("update-profile", profile);

            var data = {};
            data.participants = [{id: testUser._id}, {id: testUser2._id}];
            data.title = "Test";
            data.messages = [{sender: testUser._id, time: Date.now(), body: "Hello"}];

            client.emit("new_conversation", data);

            client2.emit("init_conversations", testUser2._id);

            /*
            var message = {};
            message.id = serverMessage._id;
            message.sender = testUser._id;
            message.time = Date.now();
            message.body = "Hi";
            client.emit("message", message);
            */
            /*
            setTimeout(function() {
                client1.disconnect();
                client2.disconnect();
            }, 1000);
            */

            setTimeout(function() {
                assert(true);
                done();
            }, 500);

        });
        it("Server sends back list of users after registering", function(done) {
            client1.emit("register_user", testUser._id);
            client2.emit("register_user", testUser2._id);

            client1.on("users", function(users) {
                assert.equal(users.length, 2);
                done();
            });
        });
        it("Client able to update profile", function(done) {
            var profile = {};
            profile.id = testUser._id;
            profile.avatarUrl = testGithubUser.avatar_url;
            profile.color = "#D3D3D3";

            client1.emit("update-profile", profile);

            client2.on("user-update", function(data) {
                assert(data._id, testUser._id);
                done();
            });
            /*
            setTimeout(function() {
                done();
            }, 1000);
            */
        });
        it("Create a new conversation", function(done) {
            var data = {};
            data.participants = [{id: testUser._id}, {id: testUser2._id}];
            data.title = "Test";
            data.messages = [{sender: testUser._id, time: Date.now(), body: "Hello"}];

            client1.emit("new_conversation", data);

            client1.on("new_conversation", function (smsg) {
                assert(smsg._id !== "undefined");
                done();
            });
        });
        it("get a list of conversations", function(done) {
            client2.emit("init_conversations", testUser2._id);

            client2.on("init_conversations", function(data) {
                conversations = data;
                assert.equal(data.length, 1);
                done();
            });
        });
        it("send a message", function(done) {
            var message = {};
            message.id = conversations[0]._id;
            message.sender = testUser2._id;
            message.time = Date.now();
            message.body = "Hi";
            client2.emit("message", message);

            client2.on("message", function(msg) {
                assert(msg._id !== "undefined");
                done();
            });
        });
        it("Leave conversation", function(done) {
            var data = {};
            data.userId = testUser._id;
            data.conversation = conversations[0]._id;
            client1.emit("leaveConversation", data);

            client2.on("leave-conversation", function(data) {
                assert.equal(data.userId, testUser._id);
                done();
            });
        });
        it("Add user to conversation", function(done) {
            var data = {};
            data.participants = [{id: testUser._id}];
            data.id = conversations[0]._id;
            client2.emit("add-more-users", data);

            client2.on("user-joined", function(msg) {
                assert.equal(msg.participants.length, 2);
                done();
            });
        });
        it("change topic of conversation", function(done) {
            var data = {};
            data.id = conversations[0]._id;
            data.topic = "test topic";
            client1.emit("change-topic", data);
            client2.on("change-topic", function(msg) {
                assert.equal(msg.topic, data.topic);
                done();
            });
        });
        it("disconnect clients", function(done) {
            client1.disconnect();
            client2.disconnect();

            client1 = io.connect("http://localhost:52685");
            setTimeout(function() {
                client1.disconnect();
                done();
            }, 500);
        });
        it("tests", function(done) {
            client1 = io.connect("http://localhost:52685");
            setTimeout(function() {
                client1.emit("register_user", null);
                done();
            }, 500);
        });

    });

});
