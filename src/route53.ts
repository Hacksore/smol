import { RemovalPolicy, Duration } from "aws-cdk-lib";
import { PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { LogGroup, ResourcePolicy, RetentionDays } from "aws-cdk-lib/aws-logs";
import { HostedZone, ARecord, NsRecord } from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

interface Route53ResourcesProps {
  serverSubDomain: string;
  domain: string;
  hostedZoneId: string;
}

export class Route53Resources extends Construct {
  queryLogGroup: LogGroup;
  subDomainZoneId: string;

  constructor(scope: Construct, id: string, props: Route53ResourcesProps) {
    super(scope, id);

    this.queryLogGroup = new LogGroup(this, "QueryLogGroup", {
      logGroupName: `/aws/route53/${props.serverSubDomain}.${props.domain}`,
      retention: RetentionDays.THREE_DAYS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new ResourcePolicy(this, "ResourcePolicy", {
      policyStatements: [
        new PolicyStatement({
          principals: [new ServicePrincipal("route53.amazonaws.com")],
          actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
          resources: [this.queryLogGroup.logGroupArn],
        }),
      ],
    });

    const hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      zoneName: props.domain,
      hostedZoneId: props.hostedZoneId,
    });

    const subdomainHostedZone = new HostedZone(this, "SubdomainHostedZone", {
      zoneName: props.serverSubDomain + "." + props.domain,
      queryLogsLogGroupArn: this.queryLogGroup.logGroupArn,
    });

    new NsRecord(this, "SubdomainNsRecord", {
      zone: hostedZone,
      values: subdomainHostedZone.hostedZoneNameServers as string[],
      recordName: props.serverSubDomain + "." + props.domain,
    });

    new ARecord(this, "clientSiteARecord", {
      zone: subdomainHostedZone,
      target: { values: ["192.168.1.1"] },
      ttl: Duration.seconds(30),
      recordName: props.serverSubDomain + "." + props.domain,
    });
    this.subDomainZoneId = subdomainHostedZone.hostedZoneId;
  }
}
