/*
 * Copyright (c) 2018. Taimos GmbH http://www.taimos.de
 */

import {Context} from 'aws-lambda';
import {Object} from 'aws-sdk/clients/s3';
import {FargateService, Fragment, MacroEvent, MacroResponse, Resource} from './types';

export const handler = async (event : MacroEvent, context : Context) : Promise<MacroResponse> => {
    const fragment : Fragment = event.fragment;

    const resourceNames = Object.keys(fragment.Resources);
    resourceNames.forEach((name) => {
        if (fragment.Resources[name].Type === 'Taimos::FargateService') {
            const resources = convertFargateService(name, <FargateService> (fragment.Resources[name].Properties));
            delete fragment.Resources[name];
            fragment.Resources = {...fragment.Resources, ...resources};
        }
    });

    const res : MacroResponse = {
        requestId: event.requestId,
        status: 'success',
        fragment,
    };
    console.log(JSON.stringify(res));
    return res;
};

const convertFargateService = (name : string, service : FargateService) : { [logicalName : string] : Resource } => {
    const resources : { [logicalName : string] : Resource } = {};

    if (service.Policies) {
        resources[`${name}TaskRole`] = createTaskRole(name, service);
    }
    resources[`${name}LogGroup`] = createLogGroup(name, service);
    resources[`${name}TaskDefinition`] = createTaskDefinition(name, service);
    resources[`${name}Service`] = createService(name, service);
    resources[`${name}HttpsListenerPriority`] = createHttpsListenerPriority(name, service);
    resources[`${name}HttpsListenerRule`] = createHttpsListenerRule(name, service);
    resources[`${name}TargetGroup`] = createTargetGroup(name, service);
    resources[`${name}Route53Record`] = createRoute53Record(name, service);

    return resources;
};

const createTaskRole = (name : string, service : FargateService) : Resource => {
    return {
        Type: 'AWS::IAM::Role',
        Properties: {
            AssumeRolePolicyDocument: {
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: ['ecs-tasks.amazonaws.com'],
                    },
                    Action: 'sts:AssumeRole',
                }],
            },
            Path: '/',
            Policies: service.Policies,
        },
    };
};

const createLogGroup = (name : string, service : FargateService) : Resource => {
    return {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
            LogGroupName: `/Fargate/${service.BaseStack}/${service.Name}`,
            RetentionInDays: 7,
        },
    };
};

const createTaskDefinition = (name : string, service : FargateService) : Resource => {
    return {
        Type: 'AWS::ECS::TaskDefinition',
        Properties: {
            Family: `${service.BaseStack}-${service.Name}`,
            Cpu: (service.Size && service.Size.Cpu) ? `${service.Size.Cpu}` : '256',
            Memory: (service.Size && service.Size.Memory) ? `${service.Size.Memory}` : '512',
            NetworkMode: 'awsvpc',
            RequiresCompatibilities: [
                'FARGATE',
            ],
            ExecutionRoleArn: {'Fn::ImportValue': `${service.BaseStack}-ECSTaskExecutionRole`},
            TaskRoleArn: service.Policies ? {Ref: `${name}TaskRole`} : undefined,
            ContainerDefinitions: [
                {
                    Name: service.Name,
                    Cpu: (service.Size && service.Size.Cpu) ? service.Size.Cpu : 256,
                    Memory: (service.Size && service.Size.Memory) ? service.Size.Memory : 512,
                    Image: service.Image,
                    PortMappings: [
                        {
                            ContainerPort: service.Port || 80,
                        },
                    ],
                    LogConfiguration: {
                        LogDriver: 'awslogs',
                        Options: {
                            'awslogs-group': {Ref: `${name}LogGroup`},
                            'awslogs-region': {Ref: 'AWS::Region'},
                            'awslogs-stream-prefix': service.Name,
                        },
                    },
                    Environment: service.Environment ? Object.keys(service.Environment).map((key : string) => ({
                        Name: key,
                        Value: service.Environment[key],
                    })) : null,
                },
            ],
        },
    };
};

const createService = (name : string, service : FargateService) : Resource => {
    const securityGroups = [
        {'Fn::ImportValue': `${service.BaseStack}-FargateContainerSecurityGroup`},
    ];
    if (service.SecurityGroups && service.SecurityGroups.length > 0) {
        service.SecurityGroups.forEach((sg) => securityGroups.push(sg));
    }
    return {
        Type: 'AWS::ECS::Service',
        DependsOn: [
            `${name}HttpsListenerRule`,
        ],
        Properties: {
            Cluster: {'Fn::ImportValue': `${service.BaseStack}-ClusterName`},
            LaunchType: 'FARGATE',
            DeploymentConfiguration: {
                MaximumPercent: 200,
                MinimumHealthyPercent: 75,
            },
            DesiredCount: (service.Size && service.Size.Count) ? service.Size.Count : 2,
            HealthCheckGracePeriodSeconds: service.HealthCheck && service.HealthCheck.GracePeriod ? service.HealthCheck.GracePeriod : 10,
            NetworkConfiguration: {
                AwsvpcConfiguration: {
                    AssignPublicIp: 'ENABLED',
                    SecurityGroups: securityGroups,
                    Subnets: {
                        'Fn::Split': [
                            ',',
                            {'Fn::ImportValue': `${service.BaseStack}-Subnets`},
                        ],
                    },
                },
            },
            TaskDefinition: {Ref: `${name}TaskDefinition`},
            LoadBalancers: [
                {
                    ContainerName: service.Name,
                    ContainerPort: service.Port || 80,
                    TargetGroupArn: {Ref: `${name}TargetGroup`},
                },
            ],
        },
    };
};

const createHttpsListenerPriority = (name : string, service : FargateService) : Resource => {
    return {
        Type: 'Custom::HttpsListenerPriority',
        Properties: {
            ServiceToken: {'Fn::ImportValue': 'FargateMacro-PrioLookupFunction'},
            ServiceDomain: {
                'Fn::Sub': [
                    `${getServiceSubdomain(service)}.\${domain}`,
                    {
                        domain: {'Fn::ImportValue': `${service.BaseStack}-Domain`},
                    },
                ],
            },
            ListenerArn: {'Fn::ImportValue': `${service.BaseStack}-PublicListenerTls`},
        },
    };
};

const createHttpsListenerRule = (name : string, service : FargateService) : Resource => {
    // noinspection TsLint
    return {
        Type: 'AWS::ElasticLoadBalancingV2::ListenerRule',
        Properties: {
            Actions: [
                {
                    Type: 'forward',
                    TargetGroupArn: {Ref: `${name}TargetGroup`},
                },
            ],
            Conditions: [
                {
                    Field: 'host-header',
                    Values: [{
                        'Fn::Sub': [
                            `${getServiceSubdomain(service)}.\${domain}`,
                            {
                                domain: {'Fn::ImportValue': `${service.BaseStack}-Domain`},
                            },
                        ],
                    }],
                },
            ],
            ListenerArn: {'Fn::ImportValue': `${service.BaseStack}-PublicListenerTls`},
            Priority: {'Fn::GetAtt': [`${name}HttpsListenerPriority`, 'Priority']},
        },
    };
};

const createTargetGroup = (name : string, service : FargateService) : Resource => {
    return {
        Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
        Properties: {
            HealthCheckIntervalSeconds: 6,
            HealthCheckPath: (service.HealthCheck && service.HealthCheck.Path) ? service.HealthCheck.Path : '/',
            HealthCheckProtocol: service.Protocol || 'HTTP',
            HealthCheckTimeoutSeconds: 5,
            HealthyThresholdCount: 2,
            Matcher: (service.HealthCheck && service.HealthCheck.Status) ? {
                HttpCode: service.HealthCheck.Status,
            } : null,
            TargetType: 'ip',
            Port: service.Port || 80,
            Protocol: service.Protocol || 'HTTP',
            UnhealthyThresholdCount: 2,
            VpcId: {'Fn::ImportValue': `${service.BaseStack}-VPCId`},
            TargetGroupAttributes: [{
                Key: 'deregistration_delay.timeout_seconds',
                Value: service.DeregistrationDelay || '10',
            }],
        },
    };
};

const createRoute53Record = (name : string, service : FargateService) : Resource => {
    return {
        Type: 'AWS::Route53::RecordSet',
        Properties: {
            HostedZoneName: {
                'Fn::Sub': [
                    `\${domain}.`,
                    {
                        domain: {'Fn::ImportValue': `${service.BaseStack}-Domain`},
                    },
                ],
            },
            Name: {
                'Fn::Sub': [
                    `${getServiceSubdomain(service)}.\${domain}`,
                    {
                        domain: {'Fn::ImportValue': `${service.BaseStack}-Domain`},
                    },
                ],
            },
            Type: 'A',
            AliasTarget: {
                DNSName: {'Fn::ImportValue': `${service.BaseStack}-ELB-DNSName`},
                HostedZoneId: {'Fn::ImportValue': `${service.BaseStack}-ELB-DNSZone`},
            },
        },
    };
};

const getServiceSubdomain = (service : FargateService) : string => {
    return service.Subdomain || service.Name.toLowerCase();
};
