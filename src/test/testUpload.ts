/* tslint:disable:no-unused-expression */

import { expect } from 'chai';

import { Server } from 'http';
import { AddressInfo } from 'net';
import { Readable } from 'stream';
import express, { Express } from 'express';
import graphqlHTTP from 'express-graphql';
import { graphqlUploadExpress } from 'graphql-upload';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { buildSchema } from 'graphql';
import { SubschemaConfig } from '../Interfaces';
import { createServerHttpLink } from '../links';
import { makeExecutableSchema } from '../makeExecutableSchema';
import { GraphQLUpload } from '../scalars';
import { mergeSchemas, delegateToSchema } from '../stitching';

function streamToString(stream: Readable) {
  const chunks: Array<Buffer> = [];
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function startServer(e: Express): Promise<Server> {
  return new Promise((resolve, reject) => {
    e.listen(undefined, 'localhost', function (error) {
      if (error) {
        reject(error);
      } else {
        resolve(this);
      }
    });
  });
}

function testGraphqlMultipartRequest(query: string, port: number) {
  const body = new FormData();

  body.append('operations', JSON.stringify({
    query,
    variables: {
      file: null,
    },
  }));
  body.append('map', '{ "1": ["variables.file"] }');
  body.append('1', 'abc', { filename: __filename });

  return fetch(`http://localhost:${port}`, { method: 'POST', body });
}

describe('graphql upload', () => {
  it('should return a file after uploading one', async () => {
    const remoteSchema = makeExecutableSchema({
      typeDefs: `
        scalar Upload
        type Query {
          version: String
        }
        type Mutation {
          upload(file: Upload): String
        }
      `,
      resolvers: {
        Mutation: {
          upload: async (root, { file }) => {
            const { createReadStream } = await file;
            const stream = createReadStream();
            const s = await streamToString(stream);
            return s;
          }
        },
        Upload: GraphQLUpload,
      },
    });

    const remoteApp = express().use(
      graphqlUploadExpress(),
      graphqlHTTP({ schema: remoteSchema }),
    );

    const remoteServer = await startServer(remoteApp);
    const remotePort = (remoteServer.address() as AddressInfo).port;

    const nonExecutableSchema = buildSchema(`
      scalar Upload
      type Query {
        version: String
      }
      type Mutation {
        upload(file: Upload): String
      }
    `);

    const subSchema: SubschemaConfig = {
      schema: nonExecutableSchema,
      link: createServerHttpLink({
        uri: `http://localhost:${remotePort}`,
      }),
    };

    const gatewaySchema = mergeSchemas({
      schemas: [subSchema],
      resolvers: {
        Mutation: {
          upload: async (root, args, context, info) => {
            const result = await delegateToSchema({
              schema: subSchema,
              operation: 'mutation',
              fieldName: 'upload',
              args,
              context,
              info,
            });
            return result;
          }
        },
        Upload: GraphQLUpload,
      },
    });

    const gatewayApp = express().use(
      graphqlUploadExpress(),
      graphqlHTTP({ schema: gatewaySchema }),
    );

    const gatewayServer = await startServer(gatewayApp);
    const gatewayPort = (gatewayServer.address() as AddressInfo).port;
    const query = `
      mutation upload($file: Upload!) {
        upload(file: $file)
      }
    `;
    const res = await testGraphqlMultipartRequest(query, gatewayPort);

    expect(await res.json()).to.deep.equal({
      data: {
        upload: 'abc',
      },
    });

    remoteServer.close();
    gatewayServer.close();
  });
});
