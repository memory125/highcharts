/**
 * (c) 2009-2018 Øystein Moseng
 *
 * TimelineEvent class definition.
 *
 * License: www.highcharts.com/license
 */

'use strict';

import H from '../../parts/Globals.js';
import utilities from 'utilities.js';


/**
 * The TimelineEvent class. Represents a sound event on a timeline.
 *
 * @private
 * @class TimelineEvent
 *
 * @param   {Object} options
 *          Options for the TimelineEvent.
 *
 * @param   {*} [options.eventObject]
 *          The object we want to sonify when playing the TimelineEvent. Can be
 *          any object that implements the `sonify` and `cancelSonify`
 *          functions. If this is not supplied, the TimelineEvent is considered
 *          a silent event, and the onEnd event is immediately called.
 *
 * @param   {Object} [options.playOptions]
 *          Options to pass on to the eventObject when playing it.
 *
 * @param   {number} [options.time=0]
 *          The time at which we want this event to play (in milliseconds
 *          offset). This is not used for the TimelineEvent.play function, but
 *          rather intended as a property to decide when to call
 *          TimelineEvent.play.
 *
 * @param   {String} [options.id]
 *          Unique ID for the event. Generated automatically if not supplied.
 *
 * @param   {Function} [options.onEnd]
 *          Callback called when the play has finished.
 */
function TimelineEvent(options) {
    this.init(options || {});
}
TimelineEvent.prototype.init = function (options) {
    this.options = options;
    this.time = options.time || 0;
    this.id = this.options.id = options.id || H.uniqueKey();
};


/**
 * Play the event. Does not take the TimelineEvent.time option into account,
 * and plays the event immediately.
 *
 * @param   {Object} [options]
 *          Options to pass in to the eventObject when playing it.
 */
TimelineEvent.prototype.play = function (options) {
    var eventObject = this.options.eventObject,
        masterOnEnd = this.options.onEnd,
        playOnEnd = options && options.onEnd,
        playOptionsOnEnd = this.options.playOptions &&
            this.options.playOptions.onEnd,
        playOptions = H.merge(this.options.playOptions, options);

    if (eventObject) {
        // If we have multiple onEnds defined, use all
        playOptions.onEnd = masterOnEnd || playOnEnd || playOptionsOnEnd ?
            function () {
                var args = arguments;
                [masterOnEnd, playOnEnd, playOptionsOnEnd].forEach(
                    function (onEnd) {
                        if (onEnd) {
                            onEnd.apply(this, args);
                        }
                    }
                );
            } : undefined;

        eventObject.sonify(playOptions);
    } else {
        if (playOnEnd) {
            playOnEnd();
        }
        if (masterOnEnd) {
            masterOnEnd();
        }
    }
};


/**
 * Cancel the sonification of this event. Does nothing if the event is not
 * currently sonifying.
 *
 * @param   {boolean} [fadeOut=false] Whether or not to fade out as we stop. If
 *          false, the event is cancelled synchronously.
 */
TimelineEvent.prototype.cancel = function (fadeOut) {
    this.options.eventObject.cancelSonify(fadeOut);
};


/**
 * The TimelinePath class. Represents a track on a timeline with a list of
 * sound events to play at certain times relative to each other.
 *
 * @private
 * @class TimelinePath
 *
 * @param   {Object} options
 *          Options for the TimelinePath.
 *
 * @param   {Array<TimelineEvent>} options.events
 *          List of TimelineEvents to play on this track.
 *
 * @param   {number} [options.silentWait]
 *          If this option is supplied, this path ignores all events and just
 *          waits for the specified number of milliseconds before calling onEnd.
 *
 * @param   {String} [options.id]
 *          Unique ID for this timeline path. Automatically generated if not
 *          supplied.
 *
 * @param   {Function} [options.onStart]
 *          Callback called before the path starts playing.
 *
 * @param   {Function} [options.onEventStart]
 *          Callback function to call before an event plays.
 *
 * @param   {Function} [options.onEventEnd]
 *          Callback function to call after an event has stopped playing.
 *
 * @param   {Function} [options.onEnd]
 *          Callback called when the whole path is finished.
 */
function TimelinePath(options) {
    this.init(options);
}
TimelinePath.prototype.init = function (options) {
    this.options = options;
    this.id = this.options.id = options.id || H.uniqueKey();
    this.cursor = 0;
    this.eventsPlaying = {};

    // Handle silent wait, otherwise use events from options
    this.events =
        options.silentWait ?
        [
            new TimelineEvent({ time: 0 }),
            new TimelineEvent({ time: options.silentWait })
        ] :
        this.options.events;

    // We need to sort our events by time
    this.sortEvents();

    // Get map from event ID to index
    this.updateEventIdMap();

    // Signal events to fire
    this.signalHandler = new utilities.SignalHandler(
        ['playOnEnd', 'masterOnEnd', 'onStart', 'onEventStart', 'onEventEnd']
    );
    this.signalHandler.registerSignalCallbacks(
        H.merge(options, { masterOnEnd: options.onEnd })
    );
};


/**
 * Sort the internal event list by time.
 * @private
 */
TimelinePath.prototype.sortEvents = function () {
    this.events = this.events.sort(function (a, b) {
        return a.time - b.time;
    });
};


/**
 * Update the internal eventId to index map.
 * @private
 */
TimelinePath.prototype.updateEventIdMap = function () {
    this.eventIdMap = this.events.reduce(function (acc, cur, i) {
        acc[cur.id] = i;
        return acc;
    }, {});
};


/**
 * Add an event to the path. Should not be done while the path is playing.
 * The new event is inserted according to its time property.
 *
 * @param {TimelineEvent} newEvent The new timeline event to add to the path.
 */
TimelinePath.prototype.addTimelineEvent = function (newEvent) {
    this.events.push(newEvent);
    this.sortEvents(); // Sort events by time
    this.updateEventIdMap(); // Update the event ID to index map
};


/**
 * Get the current TimelineEvent under the cursor.
 * @return {TimelineEvent} The current timeline event.
 */
TimelinePath.prototype.getCursor = function () {
    return this.events[this.cursor];
};


/**
 * Set the current TimelineEvent under the cursor.
 *
 * @param   {String} eventId
 *          The ID of the timeline event to set as current.
 * @return  {boolean} True if there is an event with this ID in the path. False
 *          otherwise.
 */
TimelinePath.prototype.setCursor = function (eventId) {
    var ix = this.eventIdMap[eventId];
    if (ix !== undefined) {
        this.cursor = ix;
        return true;
    }
    return false;
};


/**
 * Play the timeline from the current cursor.
 *
 * @param   {Function} onEnd Callback to call when play finished. Does not
 *          override other onEnd callbacks.
 */
TimelinePath.prototype.play = function (onEnd) {
    this.pause();
    this.signalHandler.emitSignal('onStart');
    this.signalHandler.clearSignalCallbacks(['playOnEnd']);
    this.signalHandler.registerSignalCallbacks({ playOnEnd: onEnd });
    this.playEvents(1);
};


/**
 * Play the timeline backwards from the current cursor.
 *
 * @param   {Function} onEnd Callback to call when play finished. Does not
 *          override other onEnd callbacks.
 */
TimelinePath.prototype.rewind = function (onEnd) {
    this.pause();
    this.signalHandler.emitSignal('onStart');
    this.signalHandler.clearSignalCallbacks(['playOnEnd']);
    this.signalHandler.registerSignalCallbacks({ playOnEnd: onEnd });
    this.playEvents(-1);
};


/**
 * Reset the cursor to the beginning.
 */
TimelinePath.prototype.resetCursor = function () {
    this.cursor = 0;
};


/**
 * Reset the cursor to the end.
 */
TimelinePath.prototype.resetCursorEnd = function () {
    this.cursor = this.events.length - 1;
};


/**
 * Cancel current playing. Leaves the cursor intact.
 *
 * @param   {boolean} [fadeOut=false] Whether or not to fade out as we stop. If
 *          false, the path is cancelled synchronously.
 */
TimelinePath.prototype.pause = function (fadeOut) {
    var timelinePath = this;

    // Cancel next scheduled play
    clearTimeout(timelinePath.nextScheduledPlay);

    // Cancel currently playing events
    Object.keys(timelinePath.eventsPlaying).forEach(function (id) {
        timelinePath.eventsPlaying[id].cancel(fadeOut);
    });
    timelinePath.eventsPlaying = {};
};


/**
 * Play the events, starting from current cursor, and going in specified
 * direction.
 *
 * @private
 * @param   {number} direction The direction to play, 1 for forwards and -1 for
 *          backwards.
 */
TimelinePath.prototype.playEvents = function (direction) {
    var timelinePath = this,
        curEvent = timelinePath.events[this.cursor],
        nextEvent = timelinePath.events[this.cursor + direction],
        timeDiff;

    // Play the current event
    timelinePath.signalHandler.emitSignal('onEventStart', curEvent);
    timelinePath.eventsPlaying[curEvent.id] = curEvent;
    curEvent.play({
        onEnd: function (cancelled) {
            var signalData = {
                event: curEvent,
                cancelled: !!cancelled
            };

            // Keep track of currently playing events for cancelling
            delete timelinePath.eventsPlaying[curEvent.id];

            // Handle onEventEnd
            timelinePath.signalHandler.emitSignal('onEventEnd', signalData);

            // Reached end of path?
            if (!nextEvent) {
                timelinePath.signalHandler.emitSignal(
                    'masterOnEnd', signalData
                );
                timelinePath.signalHandler.emitSignal(
                    'playOnEnd', signalData
                );
            }
        }
    });

    // Schedule next
    if (nextEvent) {
        timeDiff = Math.abs(nextEvent.time - curEvent.time);
        if (timeDiff < 1) {
            // Play immediately
            timelinePath.cursor += direction;
            timelinePath.playEvents(direction);
        } else {
            // Schedule after the difference in ms
            this.nextScheduledPlay = setTimeout(function () {
                timelinePath.cursor += direction;
                timelinePath.playEvents(direction);
            }, timeDiff);
        }
    }
};


/**
 * The Timeline class. Represents a sonification timeline with a list of
 * timeline paths with events to play at certain times relative to each other.
 *
 * @private
 * @class Timeline
 *
 * @param   {Object} options
 *          Options for the Timeline.
 *
 * @param   {Array<TimelinePath|Array<TimelinePath>>} options.paths
 *          List of TimelinePaths to play. Multiple paths can be grouped
 *          together and played simultaneously by supplying an array of paths
 *          in place of a single path.
 *
 * @param   {Function} [options.onPathStart]
 *          Callback function to call before a path plays.
 *
 * @param   {Function} [options.onPathEnd]
 *          Callback function to call after a path has stopped playing.
 *
 * @param   {Function} [options.onEnd]
 *          Callback called when the whole timeline has reached its end.
 */
function Timeline(options) {
    this.init(options || {});
}
Timeline.prototype.init = function (options) {
    this.options = options;
    this.cursor = 0;
    this.paths = options.paths;
    this.pathsPlaying = {};
    this.signalHandler = new utilities.SignalHandler(
        ['playOnEnd', 'masterOnEnd', 'onPathStart', 'onPathEnd']
    );
    this.signalHandler.registerSignalCallbacks(
        H.merge(options, { masterOnEnd: options.onEnd })
    );
};


/**
 * Play the timeline forwards from cursor.
 *
 * @param   {Function} onEnd Callback to call when play finished. Does not
 *          override other onEnd callbacks.
 */
Timeline.prototype.play = function (onEnd) {
    this.pause();
    this.signalHandler.clearSignalCallbacks(['playOnEnd']);
    this.signalHandler.registerSignalCallbacks({ playOnEnd: onEnd });
    this.playPaths(1);
};


/**
 * Play the timeline backwards from cursor.
 *
 * @param   {Function} onEnd Callback to call when play finished. Does not
 *          override other onEnd callbacks.
 */
Timeline.prototype.rewind = function (onEnd) {
    this.pause();
    this.signalHandler.clearSignalCallbacks(['playOnEnd']);
    this.signalHandler.registerSignalCallbacks({ playOnEnd: onEnd });
    this.playPaths(-1);
};


/**
 * Play the timeline in the specified direction.
 *
 * @private
 * @param   {number} direction Direction to play in. 1 for forwards, -1 for
 *          backwards.
 */
Timeline.prototype.playPaths = function (direction) {
    var curPaths = H.splat(this.paths[this.cursor]),
        nextPaths = this.paths[this.cursor + direction],
        timeline = this,
        signalHandler = this.signalHandler,
        pathsEnded = 0,
        // Play a path
        playPath = function (path) {
            // Emit signal and set playing state
            signalHandler.emitSignal('onPathStart', path);
            timeline.pathsPlaying[path.id] = path;
            // Do the play
            path[direction > 0 ? 'play' : 'rewind'](function (callbackData) {
                // Play ended callback
                // Data to pass to signal callbacks
                var cancelled = callbackData && callbackData.cancelled,
                    signalData = {
                        path: path,
                        cancelled: cancelled
                    };

                // Clear state and send signal
                delete timeline.pathsPlaying[path.id];
                signalHandler.emitSignal('onPathEnd', signalData);

                // Handle next paths
                pathsEnded++;
                if (nextPaths && !cancelled) {
                    if (pathsEnded >= curPaths.length) {
                        // We finished all of the current paths for cursor.
                        // Move cursor along
                        timeline.cursor += direction;
                        // Reset upcoming path cursors before playing
                        H.splat(nextPaths).forEach(function (nextPath) {
                            nextPath[
                                direction > 0 ? 'resetCursor' : 'resetCursorEnd'
                            ]();
                        });
                        // Play next
                        timeline.playPaths(direction);
                    }
                } else {
                    // If it is the last path in this direction, call onEnd
                    signalHandler.emitSignal('playOnEnd', signalData);
                    signalHandler.emitSignal('masterOnEnd', signalData);
                }
            });
        };

    // Go through the paths under cursor and play them
    curPaths.forEach(function (path) {
        // Leave a timeout to let notes fade out before next play
        setTimeout(function () {
            playPath(path);
        }, H.sonification.fadeOutTime);
    });
};


/**
 * Stop the playing of the timeline. Cancels all current sounds, but does not
 * affect the cursor.
 *
 * @param   {boolean} [fadeOut=false] Whether or not to fade out as we stop. If
 *          false, the timeline is cancelled synchronously.
 */
Timeline.prototype.pause = function (fadeOut) {
    var timeline = this;

    // Cancel currently playing events
    Object.keys(timeline.pathsPlaying).forEach(function (id) {
        timeline.pathsPlaying[id].pause(fadeOut);
    });
    timeline.pathsPlaying = {};
};


/**
 * Reset the cursor to the beginning of the timeline.
 */
Timeline.prototype.resetCursor = function () {
    this.paths.forEach(function (paths) {
        H.splat(paths).forEach(function (path) {
            path.resetCursor();
        });
    });
    this.cursor = 0;
};


/**
 * Reset the cursor to the end of the timeline.
 */
Timeline.prototype.resetCursorEnd = function () {
    this.paths.forEach(function (paths) {
        H.splat(paths).forEach(function (path) {
            path.resetCursorEnd();
        });
    });
    this.cursor = this.paths.length - 1;
};


/**
 * Set the current TimelineEvent under the cursor. If multiple paths are being
 * played at the same time, this function only affects a single path (the one
 * that contains the eventId that is passed in).
 *
 * @param   {String} eventId
 *          The ID of the timeline event to set as current.
 *
 * @return  {boolean} True if the cursor was set, false if no TimelineEvent was
 *          found for this ID.
 */
Timeline.prototype.setCursor = function (eventId) {
    return this.paths.some(function (paths) {
        return H.splat(paths).some(function (path) {
            return path.setCursor(eventId);
        });
    });
};


/**
 * Get the current TimelineEvents under the cursors. This function will return
 * the event under the cursor for each currently playing path, as an object
 * where the path ID is mapped to the TimelineEvent under that path's cursor.
 *
 * @return {Object} The TimelineEvents under each path's cursors.
 */
Timeline.prototype.getCursor = function () {
    return this.getCurrentPlayingPaths().reduce(function (acc, cur) {
        acc[cur.id] = cur.getCursor();
        return acc;
    }, {});
};


/**
 * Get the current TimelinePaths being played.
 *
 * @return {Array<TimelinePath>} The TimelinePaths currently being played.
 */
Timeline.prototype.getCurrentPlayingPaths = function () {
    return H.splat(this.paths[this.cursor]);
};


// Export the classes
var timelineClasses = {
    TimelineEvent: TimelineEvent,
    TimelinePath: TimelinePath,
    Timeline: Timeline
};
export default timelineClasses;