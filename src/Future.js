/**********************************************************\
|                                                          |
|                          hprose                          |
|                                                          |
| Official WebSite: http://www.hprose.com/                 |
|                   http://www.hprose.org/                 |
|                                                          |
\**********************************************************/

/**********************************************************\
 *                                                        *
 * Future.js                                              *
 *                                                        *
 * hprose Future for HTML5.                               *
 *                                                        *
 * LastModified: Jul 15, 2015                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/* jshint -W067 */
(function (global, undefined) {
    'use strict';

    var PENDING = 0;
    var FULFILLED = 1;
    var REJECTED = 2;

    var setImmediate = global.setImmediate;

    function Future(computation) {
        if (typeof computation === "function") {
            var completer = new Completer();
            setImmediate(function() {
                try {
                    completer.complete(computation());
                }
                catch(e) {
                    completer.completeError(e);
                }
            });
            return completer.future;
        }
    }

    function delayed(duration, computation) {
        if (computation === undefined) {
            computation = function() { return null; };
        }
        var completer = new Completer();
        global.setTimeout(function() {
            try {
                completer.complete(computation());
            }
            catch(e) {
                completer.completeError(e);
            }
        }, duration);
        return completer.future;
    }

    function error(e) {
        var completer = new Completer();
        completer.completeError(e);
        return completer.future;
    }

    function sync(computation) {
        var completer = new Completer(true);
        try {
            completer.complete(computation());
        }
        catch(e) {
            completer.completeError(e);
        }
        return completer.future;
    }

    function value(v) {
        return sync(function() { return v; });
    }

    Object.defineProperties(Future, {
        delayed: { value: delayed },
        error: { value: error },
        sync: { value : sync },
        value: { value : value }
    });

    global.hprose.Future = Future;

    function isFuture(obj) {
        return (obj instanceof Future) && (typeof (obj.then === "function"));
    }

    function Completer(sync) {
        var _status = PENDING;
        var _result;
        var _error;
        var _tasks = [];
        var _future = new Future();
        var run = sync ?
            function(callback, next, x) {
                try {
                    var r = callback(x);
                    next.complete(r);
                }
                catch(e) {
                    next.completeError(e);
                }
            } :
            function(callback, next, x) {
                setImmediate(function() {
                    try {
                        var r = callback(x);
                        next.complete(r);
                    }
                    catch(e) {
                        next.completeError(e);
                    }
                });
            };

        function resolve(resolvePromise, rejectPromise, next, x) {
            if (isFuture(x)) {
                if (x === _future) {
                    throw new TypeError('Self resolution');
                }
                x.then(resolvePromise, rejectPromise)
                 .then(next.complete, next.completeError);
            }
            else if ((typeof x === "object") || (typeof x === "function")) {
                var then;
                try {
                    then = x.then;
                }
                catch (e) {
                    if (rejectPromise) {
                        run(rejectPromise, next, e);
                    }
                    else {
                        next.completeError(e);
                    }
                    return;
                }
                if (typeof then === "function") {
                    try {
                        var f = then.call(x, resolvePromise, rejectPromise);
                        f.then(next.complete, next.completeError);
                    }
                    catch (e) {
                        next.completeError(e);
                    }
                }
                else if (resolvePromise) {
                    run(resolvePromise, next, x);
                }
            }
            else if (resolvePromise) {
                run(resolvePromise, next, x);
            }
        }

        // Calling complete must not be done more than once.
        function complete(result) {
            if (_status === PENDING) {
                _status = FULFILLED;
                _result = result;
                while (_tasks.length > 0) {
                    var task = _tasks.shift();
                    resolve(task.resolvePromise, task.rejectPromise, task.next, result);
                }
            }
        }

        // Calling complete must not be done more than once.
        function completeError(error) {
            if (_status === PENDING) {
                _status = REJECTED;
                _error = error;
                while (_tasks.length > 0) {
                    var task = _tasks.shift();
                    if (task.rejectPromise) {
                        run(task.rejectPromise, task.next, error);
                    }
                }
            }
        }

        function then(onComplete, onError) {
            if (typeof onComplete !== "function") onComplete = null;
            if (typeof onError !== "function") onError = null;
            if (onComplete || onError) {
                var next = new Completer(sync);
                if (onComplete && (_status === FULFILLED)) {
                    resolve(onComplete, onError, next, _result);
                }
                else if (onError && (_status === REJECTED)) {
                    run(onError, next, _error);
                }
                else {
                    _tasks.push({
                        resolvePromise: onComplete,
                        rejectPromise: onError,
                        next: next
                    });
                }
                return next.future;
            }
            return _future;
        }

        function catchError(onError) {
            return then(null, onError);
        }

        function whenComplete(action) {
            return then(
                function(v) {
                    var f = action();
                    if (isFuture(f)) return f.then(function() { return v; });
                    return v;
                },
                function(e) {
                    var f = action();
                    if (isFuture(f)) return f.then(function() { throw e; });
                    throw e;
                }
            );
        }

        Object.defineProperties(_future, {
            then: { value: then },
            catchError: { value: catchError },
            whenComplete: { value: whenComplete }
        });

        Object.defineProperties(this, {
            future: { get: function() { return _future; } },
            isCompleted: { get: function() { return (_status !== PENDING); } },
            complete: { value : complete },
            completeError: { value : completeError }
        });
    }

    Object.defineProperty(Completer, 'isFuture', { value: isFuture });
    Object.defineProperty(Completer, 'sync', { value: function() { return new Completer(true); } });

    global.hprose.Completer = Completer;

}(function() {
    return this || (1, eval)('this');
}()));
