# Prerequisites

You have to deploy a base stack containing the Fargate Cluster with the following CFN exports:

* `${AWS::StackName}-ClusterName`: The name of the Fargate cluster (`!Ref Cluster`)
* `${AWS::StackName}-ELB-DNSName`: The DNSName of the shared application load balancer (`!GetAtt ALB.DNSName`)
* `${AWS::StackName}-ELB-DNSZone`: The zone of the shared application load balancer (`!GetAtt ALB.CanonicalHostedZoneID`)
* `${AWS::StackName}-ECSTaskExecutionRole`: The ARN of the task execution role of the cluster (`!GetAtt ECSTaskExecutionRole.Arn`)
* `${AWS::StackName}-PublicListenerTls`: The ARN of the shared application load balancer's TLS Listener (`!Ref PublicLoadBalancerListenerTls`)
* `${AWS::StackName}-VPCId`: The id of the VPC the cluster is running in (`!Ref VPC`)
* `${AWS::StackName}-Subnets`: Comma separated list of subnets the cluster is deployed in (`!Join [',', [!Ref PublicSubnetOne, !Ref PublicSubnetTwo, !Ref PublicSubnetThree]]`)
* `${AWS::StackName}-FargateContainerSecurityGroup`: The security group used to allow Fargate containers to receive traffic from ALB (`!Ref FargateContainerSecurityGroup`)
* `${AWS::StackName}-Domain`: the domain of the application loadbalancer (`example.com`)
ECSROLE????

You can use on of the example setups for this purpose or create your of template.

# Deploy the macro

Running `./deploy.sh` deploys the CFN-Macro and a custom resource function to calculate ALB priorities.

# Use the macro

Add a new CloudForamtion resource with the new type `Taimos::FargateService` with the following properties:

## BaseStack

*Required: yes*

The name of the prefix used for the value imports. If your cluster is exported as `MyFargate-ClusterName` the value for `BaseStack` would be `MyFargate`. 

## Name

*Required: yes*

The name of the service

## Image

*Required: yes*

The name of the Docker image to use for the service 

## Port

*Required: no*

The container port to route traffic to. Default is `80`

## Protocol

*Required: no*

The container protocol to route traffic with. Default is `HTTP`

## Size

*Required: no*

Object defining the size of the service. All sub-properties are optional

### Cpu

The number of CPU shares for the container. Default is `256`

### Memory

The memory reserved for the container in MB. Default is `512`

### Count

The number of instance to run withing the service. Default is `2`

## Subdomain

*Required: no*

The subdomain to use for the Route53 entry. As domain the value of `${AWS::StackName}-Domain` will be imported.

Defaults to the service name in lower case.

## DeregistrationDelay

*Required: no*

The number of seconds to give container instance to handle existing connections before shutting them down on updates. Default is `10`

## HealthCheck

*Required: no*

Object configuring the health check of th service. All sub-properties are optional

### Path

The path to check. Default is `/`

### Status 

The expected status code. Default is `null` and uses the ALB defaults. 

## Policies

*Required: no*

An array of policies to use for the IAM role for the task. Default is not to use an IAM role.

## Environment

*Required: no*

Use this to specify environment variables for your container as key-value pairs.

## Example template
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: Taimos-Fargate
Description: Deploy a service on AWS Fargate
Parameters:
  Count:
    Type: String
    Description: The number of instances
Resources:
  TestService:
    Type: Taimos::FargateService
    Properties:
      BaseStack: Fargate-External
      Name: TestService
      Image: nginx:latest
      Protocol: HTTP
      Port: 80
      Size:
        Cpu: 256
        Memory: 512
        Count: !Ref Count
      Subdomain: test
      DeregistrationDelay: '0'
      HealthCheck:
        Path: /
        Status: '200'
        GracePeriod: 20
      Policies:
        - PolicyName: test-service
          PolicyDocument:
            Statement:
            - Effect: Allow
              Action:
                - 's3:PutObject'
              Resource: '*'
      Environment:
        FOO: bar
``` 

