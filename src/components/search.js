const Emitter = require('../modules/emitter');
const eachSeries = require('async/eachSeries');
/**
 This is our Search class which allows one to search the backlog of messages.
 Powered by [PubNub History](https://www.pubnub.com/docs/web-javascript/storage-and-history).

 Not recommended to be constructed on it's own. Instead, call {@link Chat#search}.

 @extends Emitter
 @param chatEngine
 @param chat
 @param config
 */
module.exports = class Search extends Emitter {

    constructor(chatEngine, chat, config = {}) {

        super();

        this.chatEngine = chatEngine;

        /**
        Handy property to identify what this class is.
        @type String
        */
        this.name = 'Search';

        /**
        The {@link Chat} we'll be searching
        @type Chat
        */
        this.chat = chat;

        /**
        @property {Object} [config] Our configuration for the PubNub history request. See the [PubNub History](https://www.pubnub.com/docs/web-javascript/storage-and-history) docs for more information on these parameters.
        @property {String} [config.event] The {@link Event} to search for.
        @property {Number} [config.limit=20] The maximum number of results to return that match search criteria. Search will continue operating until it returns this number of results or it reached the end of history.
        @property {Number} [config.start=0] The timetoken to begin searching between.
        @property {Number} [config.end=0] The timetoken to end searching between.
        */
        this.config = config;
        this.config.event = config.event;
        this.config.limit = config.limit || 20;
        this.config.channel = this.chat.channel;
        this.config.includeTimetoken = true;
        this.config.stringifiedTimeToken = true;
        this.config.count = this.config.count || 100;

        this.needleCount = 0;

        this.firstTT = 0;
        this.lastTT = 0;

        this.firstPage = true;

        /**
        * @private
        */
        this.sortHistory = (messages, desc) => {

            messages.sort((a, b) => {
                let e1 = desc ? b : a;
                let e2 = desc ? a : b;
                return parseInt(e1.timetoken, 10) - parseInt(e2.timetoken, 10);
            });

            return messages;

        };

        /**
         * Call PubNub history in a loop.
         * Unapologetically stolen from https://www.pubnub.com/docs/web-javascript/storage-and-history
         * @param  {[type]}   args     [description]
         * @param  {Function} callback [description]
         * @return {[type]}            [description]
         * @private
         */
        this.page = (pageDone) => {

            /**
             * Requesting another page from PubNub History
             * @event Search#$"."page"."request
             */
            this._emit('$.search.page.request');

            // only set start if this is the first call and the user hasn't set it themselves
            if (this.firstPage && !this.config.start) {
                this.config.start = this.config.reverse ? this.lastTT : this.firstTT;
            }

            this.firstPage = false;

            this.chatEngine.pubnub.history(this.config, (status, response) => {

                /**
                 * PubNub History returned a response
                 * @event Search#$"."page"."response
                 */
                this._emit('$.search.page.response');

                if (status.error) {

                    /**
                     * There was a problem fetching the history of this chat
                     * @event Chat#$"."error"."history
                     */
                    this.chatEngine.throwError(this, 'trigger', 'search', new Error('There was a problem searching history. Make sure your request parameters are valid and history is enabled for this PubNub key.'), status);

                } else {

                    // timetoken of the first message in response
                    this.firstTT = response.startTimeToken;
                    // timetoken of the last message in response
                    this.lastTT = response.endTimeToken;

                    response.messages = this.sortHistory(response.messages);

                    pageDone(response);

                }

            });
        };

        let eventFilter = (event) => {
            return {
                middleware: {
                    on: {
                        '*': (payload, next) => {
                            let matches = payload && payload.event && payload.event === event;
                            next(!matches, payload);
                        }
                    }
                }
            };
        };

        let senderFilter = (user) => {
            return {
                middleware: {
                    on: {
                        '*': (payload, next) => {
                            let matches = payload && payload.sender && payload.sender.uuid === user.uuid;
                            next(!matches, payload);
                        }
                    }
                }
            };
        };

        /**
        Increments when results that satisfy filters are found.
        */
        this.needleCount = 0;

        /**
         * @private
         */
        this.triggerHistory = (message, cb) => {

            if (this.needleCount < this.config.limit) {

                this.trigger(message.entry.event, message.entry, (reject) => {

                    if (!reject) {
                        this.needleCount += 1;
                    }
                    cb();

                });

            } else {
                cb();
            }

        };

        /**
         * @private
         */
        this.find = () => {

            this.page((response) => {

                if (!this.config.reverse) {
                    response.messages.reverse();
                }

                eachSeries(response.messages, this.triggerHistory, () => {

                    if (
                        response.messages &&
                        response.messages.length === this.config.count &&
                        this.needleCount < this.config.limit) {
                        this.find();
                    } else {

                        /**
                         * Search has returned all results or reached the end of history.
                         * @event Search#$"."finish
                         */
                        this._emit('$.search.finish');
                    }

                });

            });

            return this;

        };

        if (this.config.event) {
            this.plugin(eventFilter(this.config.event));
        }

        if (this.config.sender) {
            this.plugin(senderFilter(this.config.sender));
        }

        /**
         * Search has started.
         * @event Search#$"."start
         */
        this._emit('$.search.start');
        this.find();

    }

};
