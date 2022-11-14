import { ApolloServer } from "apollo-server-express";
import express from "express";
import { buildSchema } from "type-graphql";
import { PostResolver } from "./resolvers/post";
import cors from "cors";
import { UserResolver } from "./resolvers/user";
import Redis from "ioredis";
import session from "express-session";
import { COOKIE_NAME, __prod__ } from "./constants";
import connectRedis from "connect-redis";
import { MyContext } from "./types";
import { createConnection } from "typeorm";
import { Post } from "./entities/Post";
import { User } from "./entities/User";
import path from "path";
import { Updoot } from "./entities/Updoot";

const main = async () => {
  const conn = await createConnection({
    type: "postgres",
    database: "lireddit2",
    username: "",
    password: "",
    entities: [Post, User, Updoot],
    logging: true,
    migrations: [path.join(__dirname, "./migrations/*")],
    synchronize: true, // create table automatically without the need to run migration
  });
  await conn.runMigrations(); // run the migrations

  // await Post.delete({});

  const app = express();

  const RedisStore = connectRedis(session);
  const redis = new Redis();

  app.use(cors({ origin: "http://localhost:3000", credentials: true }));
  app.use(
    session({
      name: COOKIE_NAME,
      store: new RedisStore({
        client: redis,
        disableTouch: true,
      }),
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 days
        httpOnly: true,
        sameSite: "lax", // csrf
        secure: __prod__, // cookie only works in https
      },
      secret: "asdf",
      saveUninitialized: false,
      resave: false,
    })
  );

  const apolloServer = new ApolloServer({
    schema: await buildSchema({
      resolvers: [PostResolver, UserResolver],
      validate: false,
    }),
    context: ({ req, res }): MyContext => ({ req, res, redis }),
  });
  apolloServer.applyMiddleware({
    app,
    cors: false,
  });
  app.listen(4000, () =>
    console.log("------- server running at localhost:4000")
  );
};

main().catch(console.error);
