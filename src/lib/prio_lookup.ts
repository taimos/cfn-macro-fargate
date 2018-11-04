/*
 * Copyright (c) 2018. Taimos GmbH http://www.taimos.de
 */

import {Context} from 'aws-lambda';
import {ELBv2} from 'aws-sdk';
import {request} from 'https';
import {parse} from 'url';

export const handler = async (event : any, context : Context) : Promise<any> => {
    console.log('REQUEST RECEIVED:\n' + JSON.stringify(event));
    if (event.RequestType === 'Create' || event.RequestType === 'Update') {
        const props = event.ResourceProperties;
        const rules = await new ELBv2().describeRules({
            ListenerArn: props.ListenerArn,
        }).promise();

        const matchRule = rules.Rules.filter((rule) => {
            return rule.Conditions.filter((condition) => {
                return condition.Field === 'host-header' && condition.Values[0] === props.ServiceDomain;
            }).length > 0;
        });

        if (matchRule && matchRule.length === 1) {
            return sendResponse(event, context, 'SUCCESS', {Message: 'Resource creation successful!', Priority: matchRule[0].Priority});
        }

        const prio : number = rules.Rules
          .filter((rule) => rule.Priority !== 'default')
          .map((rule) => Number.parseInt(rule.Priority, 10))
          .reduce((previousValue, currentValue) => Math.max(previousValue, currentValue), 0);

        return sendResponse(event, context, 'SUCCESS', {Message: 'Resource creation successful!', Priority: prio + 1});
    }
    if (event.RequestType === 'Delete') {
        return sendResponse(event, context, 'SUCCESS', {Message: 'Nothing to delete!'});
    }
    return sendResponse(event, context, 'FAILED', {});
};

const sendResponse = (event, context, responseStatus : string, responseData : any) => {
    return new Promise((resolve) => {
        console.log('Sending response ' + responseStatus);
        const responseBody = JSON.stringify({
            Status: responseStatus,
            Reason: 'See the details in CloudWatch Log Stream: ' + context.logStreamName,
            PhysicalResourceId: context.logStreamName,
            StackId: event.StackId,
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId,
            Data: responseData,
        });

        const parsedUrl = parse(event.ResponseURL);
        const options = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.path,
            method: 'PUT',
            headers: {
                'content-type': '',
                'content-length': responseBody.length,
            },
        };

        const clientRequest = request(options, () => {
            resolve();
        });
        clientRequest.on('error', () => {
            resolve();
        });
        clientRequest.write(responseBody);
        clientRequest.end();
    });
};
