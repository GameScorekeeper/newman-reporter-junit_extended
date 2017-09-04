'use strict';

var _ = require('lodash'),
    xml = require('xmlbuilder');

    //util = require('../../util');
    //GskReporter;

 var SEP = ' / ';

function getFullName (item, separator) {
    if (_.isEmpty(item) || !_.isFunction(item.parent) || !_.isFunction(item.forEachParent)) { return; }

    var chain = [];
    item.forEachParent(function (parent) { chain.unshift(parent.name || parent.id); });

    item.parent() && chain.push(item.name || item.id); // Add the current item only if it is not the collection
    return chain.join(_.isString(separator) ? separator : SEP);
}

/**
 * A function that creates raw XML to be written to Newman JUnit reports.
 *
 * @param {Object} newman - The collection run object, with a event handler setter, used to enable event wise reporting.
 * @param {Object} reporterOptions - A set of JUnit reporter run options.
 * @param {String=} reporterOptions.export - Optional custom path to create the XML report at.
 * @returns {*}
 */


function GskReporter_runner(newman, reporterOptions) {
    newman.on('beforeDone', function () {
        var report = _.get(newman, 'summary.run.executions'),
            collection = _.get(newman, 'summary.collection'),
            cache,
            root,
            testSuitesExecutionTime = 0,
            executionTime = 0;

        if (!report) {
            return;
        }

        root = xml.create('testsuites', { version: '1.0', encoding: 'UTF-8' });
        root.att('name', collection.name);

        cache = _.transform(report, function (accumulator, execution) {
            accumulator[execution.id] = accumulator[execution.id] || [];
            accumulator[execution.id].push(execution);
        }, {});

        _.forEach(cache, function (executions, itemId) {
            var suite = root.ele('testsuite'),
                currentItem,
                tests = {},
                errorMessages;

            collection.forEachItem(function (item) {
                (item.id === itemId) && (currentItem = item);
            });

            if (!currentItem) { return; }

            suite.att('name', getFullName(currentItem));
            suite.att('id', currentItem.id);

            _.forEach(executions, function (execution) {
                var iteration = execution.cursor.iteration,
                    errored,
                    msg = `Iteration: ${iteration}\n`;

                // Process errors
                if (execution.requestError) {
                    errored = true;
                    msg += ('RequestError: ' + (execution.requestError.stack) + '\n');
                }
                msg += '\n---\n';
                _.forEach(['testScript', 'prerequestScript'], function (prop) {
                    _.forEach(execution[prop], function (err) {
                        if (err.error) {
                            errored = true;
                            msg = (msg + prop + 'Error: ' + err.error.stack);
                            msg += '\n---\n';
                            msg += 'Request URL: ' + currentItem.request.url;
                            msg += '\n';
                            msg += 'Request Type: ' + currentItem.request.method;
                            msg += '\n';
                            if(currentItem.request.method != "GET")
                        	{
                            	msg += 'Request Body: ' + currentItem.request.body.raw;
                            	msg += '\n';
                        	}
                            if(currentItem.response != undefined)
                        	{
                            	msg += 'Response Body: ' + currentItem.response.body.raw;
                            	msg += '\n';
                        	}
                        }
                    });
                });

                if (errored) {
                    errorMessages = _.isString(errorMessages) ? (errorMessages + msg) : msg;
                }

                // Process assertions
                _.forEach(execution.assertions, function (assertion) {
                    var name = assertion.assertion,
                        err = assertion.error;
                    if (err) {
                        (_.isArray(tests[name]) ? tests[name].push(err) : (tests[name] = [err]));
                    }
                    else {
                        tests[name] = [];
                    }
                });
                if (execution.assertions) {
                    suite.att('tests', execution.assertions.length);
                }
                else {
                    suite.att('tests', 0);
                }
            });

            suite.att('time', _.mean(_.map(executions, function (execution) {
                executionTime = _.get(execution, 'response.responseTime') / 1000 || 0;
                testSuitesExecutionTime += executionTime;
                return executionTime;
            })));
            errorMessages && suite.ele('error').dat(errorMessages);

            _.forOwn(tests, function (failures, name) {
                var testcase = suite.ele('testcase'),
                    failure;
                testcase.att('name', name);
                testcase.att('time', executionTime);
                if (failures && failures.length) {
                    _.forOwn(failures, function (fail) {
                      failure = testcase.ele('failure');
                      failure.att('type', 'AssertionFailure');
                      failure.att('message', fail.message);
                      failure.att('object', JSON.stringify(fail));
                    })
                }
            });
        });

        root.att('time', testSuitesExecutionTime);
        newman.exports.push({
            name: 'gsk-reporter',
            default: 'newman-run-report.xml',
            path: reporterOptions.export,
            content: root.end({
                pretty: true,
                indent: '  ',
                newline: '\n',
                allowEmpty: false
            })
        });
    });
};

class GskReporter {
    constructor(emitter, reporterOptions, options) {
	GskReporter_runner(emitter, reporterOptions, options);
    }

    start(err, args) {}

    beforeItem(err, args) {}

    request(err, args) {}

    assertion(err, args) {}

    item(err, args) {}

    done(err, args) {}
}

module.exports = GskReporter;
//module.exports = printMsg;
