import { StackProps, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface MCServerStackProps extends StackProps {
	env: {
		account: string;
		region: string;
	};
	memoryLimit: number;
}

export class SmolStack extends Stack {
	constructor(scope: Construct, id: string, props: MCServerStackProps) {
		super(scope, id, props);

		const vpc = new ec2.Vpc(this, "mcserver-vpc", {
			ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
		});

		const minecraftSecurityGroup = new ec2.SecurityGroup(
			this,
			"mcserver-security-group",
			{
				vpc,
				description: "Allow inbound connections on port 25565",
				allowAllOutbound: true,
			},
		);

		minecraftSecurityGroup.addIngressRule(
			ec2.Peer.anyIpv4(),
			ec2.Port.tcp(25565),
			"Allow Minecraft traffic",
		);

		const cluster = new ecs.Cluster(this, "mcserver-cluster", {
			vpc,
		});

		const autoScalingGroup = cluster.addCapacity("mcserver-cluster-asg", {
			instanceType: ec2.InstanceType.of(
				ec2.InstanceClass.C5,
				ec2.InstanceSize.XLARGE,
			),
			machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
			vpcSubnets: { subnets: vpc.publicSubnets },
			desiredCapacity: 1,
		});

		autoScalingGroup.addSecurityGroup(minecraftSecurityGroup);

		const taskDefinition = new ecs.Ec2TaskDefinition(this, "mcserver-task-def");

		const container = taskDefinition.addContainer("mcserver-container", {
			image: ecs.ContainerImage.fromRegistry("itzg/minecraft-server"),
			memoryLimitMiB: props.memoryLimit,
			environment: {
				EULA: "TRUE",
			},
		});

		container.addPortMappings({
			containerPort: 25565,
			hostPort: 25565,
		});

		new ecs.Ec2Service(this, "mcserver-ec2-service", {
			cluster: cluster,
			taskDefinition: taskDefinition,
			desiredCount: 1,
		});
	}
}
