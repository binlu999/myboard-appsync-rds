import * as cdk from '@aws-cdk/core';
import * as appsync from '@aws-cdk/aws-appsync';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as rds from '@aws-cdk/aws-rds';
import * as lambda from '@aws-cdk/aws-lambda'

export class MyBoardAppsyncRdsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    //AppSync API
    const api = new appsync.GraphqlApi(this, 'my-board-api', {
      name: 'my-board-appysync-api',
      schema: appsync.Schema.fromAsset('graphql/schema.graphql'),
      authorizationConfig: {
        
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            //expires: cdk.Expiration.after(cdk.Duration.days(365))
          }
        }
      }
    });
    const vpc = new ec2.Vpc(this, 'my-board-appsync');

    const cluster = new rds.ServerlessCluster(this, 'AuroraBlogCluster', {
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      parameterGroup: rds.ParameterGroup.fromParameterGroupName(this, 'ParameterGroup', 'default.aurora-postgresql10'),
      defaultDatabaseName: 'BlogDB',
      vpc,
      //scaling: { autoPause: cdk.Duration.seconds(0) } // Optional. If not set, then instance will pause after 5 minutes 
    });

    const postFn = new lambda.Function(this, 'MyFunction', {
      runtime: lambda.Runtime.NODEJS_10_X,
      code: new lambda.AssetCode('lambda-fns'),
      handler: 'index.handler',
      memorySize: 1024,
      environment: {
        CLUSTER_ARN: cluster.clusterArn,
        SECRET_ARN: cluster.secret?.secretArn || '',
        DB_NAME: 'BlogDB',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1'
      },
    });

    cluster.grantDataApiAccess(postFn);
    const lambdaDs = api.addLambdaDataSource('lambdaDatasource', postFn);
    // Map the resolvers to the Lambda function
    lambdaDs.createResolver({
      typeName: 'Query',
      fieldName: 'listPosts'
    });
    lambdaDs.createResolver({
      typeName: 'Query',
      fieldName: 'getPostById'
    });
    lambdaDs.createResolver({
      typeName: 'Mutation',
      fieldName: 'createPost'
    });
    lambdaDs.createResolver({
      typeName: 'Mutation',
      fieldName: 'updatePost'
    });
    lambdaDs.createResolver({
      typeName: 'Mutation',
      fieldName: 'deletePost'
    });

    // CFN Outputs
    new cdk.CfnOutput(this, 'AppSyncAPIURL', {
      value: api.graphqlUrl
    });
    new cdk.CfnOutput(this, 'AppSyncAPIKey', {
      value: api.apiKey || ''
    });
    new cdk.CfnOutput(this, 'ProjectRegion', {
      value: this.region
    });
  }
}
