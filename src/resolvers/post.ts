import { Post } from "../entities/Post";
import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from "type-graphql";
import { MyContext } from "../types";
import { isAuth } from "../middleware/isAuth";
import { getConnection } from "typeorm";
import { POSTS_LIMIT } from "../constants";
import { Updoot } from "../entities/Updoot";

/** =================================
 * @function posts query all posts
 * @function post query one post
 * @function createPost create a post
 * @function updatePost update a post
 * @function deletePost delete a post
 * @function vote vote on a post
 ================================= */

@InputType()
class PostInput {
  @Field()
  title: string;
  @Field()
  text: string;
}

@ObjectType()
class PaginatedPost {
  @Field(() => [Post]) // graphql type
  posts: Post[]; // typescript type
  @Field()
  hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
  @FieldResolver(() => String)
  textSnippet(@Root() root: Post): string {
    return root.text.slice(0, 50);
  }

  /** ==========================
   * @description vote on a post
   * @returns boolean
   ========================== */
  @Mutation(() => Boolean)
  async vote(
    @Arg("postId", () => Int) postId: number,
    @Arg("value", () => Int) value: number,
    @Ctx() { req }: MyContext
  ): Promise<boolean> {
    const isUpdoot = value !== -1;
    const { userId } = req.session;
    const realValue = isUpdoot ? 1 : -1;
    const updoot = await Updoot.findOne({ where: { userId, postId } });

    // SQL method
    // if (updoot && updoot.value !== realValue) {
    //   // voted before & changing vote (up->down or down->up)
    //   await getConnection().transaction(async (trans) => {
    //     await trans.query(
    //       `
    //       update updoot
    //       set value = $1
    //       where "postId" = $2 and "userId" = $3
    //       `,
    //       [realValue, postId, userId]
    //     );
    //     await trans.query(
    //       `
    //       update post
    //       set points = points + $1
    //       where id = $2
    //       `,
    //       [2 * realValue, postId]
    //     );
    //   });
    // } else if (!updoot) {
    //   // never voted before
    //   await getConnection().transaction(async (trans) => {
    //     await trans.query(
    //       `
    //       insert into updoot ("userId", "postId", value)
    //       values ($1,$2,$3)
    //       `,
    //       [userId, postId, realValue]
    //     );
    //     await trans.query(
    //       `
    //       update post
    //       set points = points + $1
    //       where id = $2
    //       `,
    //       [realValue, postId]
    //     );
    //   });
    // }

    // typeorm method
    const post = await Post.findOne(postId);
    if (post) {
      if (updoot && updoot.value !== realValue) {
        // voted before & changing vote (up->down or down->up)
        // await Updoot.delete({ userId, postId });
        // await Post.update({ id: postId }, { points: 0 });
        await Updoot.update({ userId, postId }, { value: realValue });
        await Post.update(
          { id: postId },
          { points: post.points + 2 * realValue }
        );
      } else if (!updoot) {
        // never voted before
        await Updoot.insert({
          userId,
          postId,
          value: realValue,
        });
        await Post.update({ id: postId }, { points: post.points + realValue });
      }
    }

    return true;
  }

  /** ===========================
   * @description query all posts
   * @returns [Post]
   =========================== */
  @Query(() => PaginatedPost)
  async posts(
    @Arg("limit", () => Int) limit: number,
    @Arg("cursor", () => String, { nullable: true }) cursor: undefined | string
  ): Promise<PaginatedPost> {
    const realLimit = Math.min(POSTS_LIMIT, limit);
    const realLimtPlusOne = realLimit + 1;
    // SQL method
    // const replacements: any[] = [realLimtPlusOne];
    // if (cursor) replacements.push(new Date(parseInt(cursor)));
    // const posts = await getConnection().query(
    //   `
    //     select p.*,
    //     json_build_object(
    //       'id', u.id,
    //       'username', u.username,
    //       'email', u.email,
    //       'createdAt', u."createdAt",
    //       'updatedAt', u."updatedAt"
    //       ) creator
    //     from post p
    //     inner join public.user u on u.id = p."creatorId"
    //     ${cursor ? `where p."createdAt" < $2` : ""}
    //     order by p."createdAt" DESC
    //     limit $1
    // `,
    //   replacements
    // );

    // typeorm method
    const postQb = await getConnection()
      .getRepository(Post)
      .createQueryBuilder("p")
      .innerJoinAndSelect("p.creator", "c")
      .orderBy("p.createdAt", "DESC")
      .take(realLimtPlusOne);
    if (cursor)
      postQb.where(`p."createdAt" < :cursor`, {
        cursor: new Date(parseInt(cursor)),
      });
    const posts = await postQb.getMany();
    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === realLimtPlusOne,
    };
  }

  /** ==========================
   * @description query one post
   * @param id! number
   * @returns Post
   ========================== */
  @Query(() => Post, { nullable: true })
  post(@Arg("id") id: number): Promise<Post | undefined> {
    return Post.findOne(id);
  }

  /** =========================
   * @description create a post
   * @param title! string
   * @returns Post
   ========================= */
  @Mutation(() => Post)
  @UseMiddleware(isAuth)
  async createPost(
    @Arg("inputs") inputs: PostInput,
    @Ctx() { req }: MyContext
  ): Promise<Post> {
    return Post.create({ ...inputs, creatorId: req.session.userId }).save();
  }

  /** =========================
   * @description update a post
   * @param id! number
   * @param title? string
   * @returns Post
   ========================= */
  @Mutation(() => Post, { nullable: true })
  async updatePost(
    @Arg("id") id: number,
    @Arg("title", { nullable: true }) title: string
  ): Promise<Post | undefined> {
    // const found = await Post.findOne({ where: { id } });
    const found = await Post.findOne(id);
    if (!found) return;
    if (typeof title !== "undefined") {
      await Post.update({ id }, { title });
    }
    return Post.findOne(id);
  }

  /** =========================
   * @description delete a post
   * @param id
   * @returns boolean
   ========================= */
  @Mutation(() => Boolean)
  async deletePost(@Arg("id") id: number): Promise<boolean> {
    const found = await Post.findOne(id);
    if (!found) {
      return false;
    }
    try {
      await Post.delete(id);
    } catch {
      return false;
    }
    return true;
  }
}
