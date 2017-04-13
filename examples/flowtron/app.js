angular.module('chatApp', ['open-chat-framework', 'auth0'])
    .config(function(authProvider) {

        authProvider.init({
          domain: 'pubnub-ocf.auth0.com',
          clientID: 'BiY_C0X0jFeVZ8KlxFqMKwT1xrn96xTM',
          loginUrl: '/login'
        });

    })
    .run(function(auth) {
        auth.hookEvents();
    })
    .factory('OCF', function(ngOCF) {
        
        // OCF Configure
        let OCF = OpenChatFramework.create({
            rltm: {
                service: 'pubnub', 
                config: {
                    publishKey: 'pub-c-07824b7a-6637-4e6d-91b4-7f0505d3de3f',
                    subscribeKey: 'sub-c-43b48ad6-d453-11e6-bd29-0619f8945a4f',
                    restore: false
                }
            },
            globalChannel: 'ocf-demo-angular-2'
        });

        // bind open chat framework angular plugin
        ngOCF.bind(OCF);

        OCF.onAny((event, data) => {
            console.log(event, data);
        });

        return OCF;

    })
    .run(['$rootScope', 'OCF', function($rootScope, OCF) {

        // // create a user for myself and store as ```me```
        $rootScope.me = OCF.connect(new Date().getTime());

        // // set a global array of chatrooms
        $rootScope.chats = [];

    }])
    .controller('LoginCtrl', function($scope, auth) {

      $scope.signin = function() {
        
        auth.signin({
          authParams: {
            scope: 'openid name email' // Specify the scopes you want to retrieve
          }
        }, function(profile, idToken, accessToken, state, refreshToken) {
          
            console.log(profile)

          // $location.path('/user-info')

        }, function(err) {
          console.log("Error :(", err);
        });
      }

    })
    .controller('Chat', function($scope, OCF) {

        $scope.chat.plugin(OpenChatFramework.plugin.typingIndicator({
            timeout: 5000
        }));

        $scope.chat.plugin(OpenChatFramework.plugin.history());

        // every chat has a list of messages
        $scope.messages = [];

        // we store the id of the lastSender
        $scope.lastSender = null;

        // leave a chatroom and remove from global chat list
        $scope.leave = (index) => {
            $scope.chat.leave();
            $scope.chats.splice(index, 1);
        }

        // send a message using the messageDraft input
        $scope.sendMessage = () => {
            $scope.chat.send('message', $scope.messageDraft);
            $scope.messageDraft = '';
        }

        // when we get notified of a user typing
        $scope.chat.on('$typingIndicator.startTyping', (event) => {
            event.sender.isTyping = true;
        });

        // when we get notified a user stops typing
        $scope.chat.on('$typingIndicator.stopTyping', (event) => {
            event.sender.isTyping = false;
        });

        // function to add a message to messages array
        let addMessage = (payload, isHistory) => {

            // if this message was from a history call
            payload.isHistory = isHistory;

            // if the last message was sent from the same user
            payload.sameUser = $scope.messages.length > 0 && payload.sender.uuid == $scope.messages[$scope.messages.length - 1].sender.uuid;
            
            // if this message was sent by this client
            payload.isSelf = payload.sender.uuid == $scope.me.uuid;

            // add the message to the array
            $scope.messages.push(payload);

        }

        // if this chat receives a message that's not from this sessions
        $scope.chat.on('$history.message', function(payload) {

            // render it in the DOM with a special class
            addMessage(payload, true);
        });

        // when this chat gets a message
        $scope.chat.on('message', function(payload) {
            // render it in the DOM
            addMessage(payload, false);
        });

    })
    .controller('OnlineUser', function($scope, OCF) {
  
        $scope.invite = function(user, channel) {

            console.log('sending invite to ', user, channel)

            // send the clicked user a private message telling them we invited them
            user.direct.send('private-invite', {channel: channel});

        }

        // create a new chat
        $scope.newChat = function(user) {

            // define a channel using the clicked user's username and this client's username
            let chan = OCF.globalChat.channel + '.' + new Date().getTime();

            // create a new chat with that channel
            let newChat = new OCF.Chat(chan);

            $scope.invite(user, chan);

            // add the chat to the list
            $scope.chats.push(newChat);

        };

    })
    .controller('ChatAppController', function($scope, OCF) {

        // bind chat to updates
        $scope.chat = OCF.globalChat;

        // when I get a private invite
        $scope.me.direct.on('private-invite', (payload) => {

            // create a new chat and render it in DOM
            $scope.chats.push(new OCF.Chat(payload.data.channel));

        });

        OCF.globalChat.plugin(OpenChatFramework.plugin.onlineUserSearch());

        // hide / show usernames based on input
        $scope.userSearch = {
            input: '',
            fire: () => { 

                // get a list of our matching users
                let found = OCF.globalChat.onlineUserSearch.search($scope.userSearch.input);
                
                // hide every user
                for(let uuid in $scope.chat.users) {
                    $scope.chat.users[uuid].hideWhileSearch = true;
                }

                // show all found users
                for(let i in found) {
                    $scope.chat.users[found[i].uuid].hideWhileSearch = false;
                }

            }
        };

        $scope.userAdd = {
            input: '',
            users: $scope.userAdd,
            fire: () => {  
                if($scope.userAdd.input.length) {
                    $scope.userAdd.users = OCF.globalChat.onlineUserSearch.search($scope.userAdd.input);   
                } else {
                    $scope.userAdd.users = [];
                }
            }
        };

    });