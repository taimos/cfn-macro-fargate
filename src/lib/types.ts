/*
 * Copyright (c) 2018. Taimos GmbH http://www.taimos.de
 */

export interface FargateService {
    BaseStack : string | any;
    Name : string | any;
    Image : string | any;
    Port? : number | any;
    Protocol? : string | any;
    Size? : FargateServiceSize;
    Subdomain? : string | any;
    HealthCheck? : FargateServiceHealthCheck;
    Policies? : any; // TODO
    SecurityGroups? : any[];
    Environment? : Map<string, string>;
    DeregistrationDelay? : string | any;
}

export interface FargateServiceSize {
    Cpu? : number | any;
    Memory? : number | any;
    Count? : number | any;
}

export interface FargateServiceHealthCheck {
    Path? : string | any;
    Status? : string | any;
    GracePeriod? : number | any;
}

export interface Fragment {
    Resources : { [logicalName : string] : Resource };

    [x : string] : any;
}

export interface Resource {
    Type : string;
    Properties : object;

    [x : string] : any;
}

export interface MacroEvent {
    requestId : string;
    fragment : Fragment;

    [x : string] : any;
}

export interface MacroResponse {
    requestId : string;
    status : 'success' | 'failed';
    fragment : Fragment;
}
