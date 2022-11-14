import argon2 from "argon2";
import { User } from "../entities/User";
import { MyContext } from "../types";
import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  Root,
} from "type-graphql";
import { EmailUsernamePassword } from "./EmailUsernamePassword";
import { validateRegister } from "../utils/validators";
import { COOKIE_NAME, FORGOT_PASSWORD_REFIX } from "../constants";
import { v4 } from "uuid";
import { sendEmail } from "../utils/sendEmail";

/** ===========================================
 * @function register register a new user
 * @function users query all users
 * @function login login user
 * @function me check the user logged in
 * @function logout logout the current user
 * @function deleteUser delete the current user
 * @function forgotPassword forgot password
 * @function changePassword change password
 =========================================== */

@ObjectType()
class FieldError {
  @Field()
  field: string;
  @Field()
  message: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];
  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver(User)
export class UserResolver {
  @FieldResolver(() => String)
  email(@Root() user: User, @Ctx() { req }: MyContext): string {
    // current user === creator
    if (req.session.userId === user.id) {
      return user.email;
    }
    return "";
  }

  /** ===================================
   * @description register a new user
   * @param options EmailUsernamePassword
   * @returns UserResponse
   =================================== */
  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: EmailUsernamePassword,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    // validate email, username, password inputs
    const errors = validateRegister(options);
    if (errors) {
      return { errors };
    }
    // register the user
    const hashedPassword = await argon2.hash(options.password);
    const newUser = User.create({
      email: options.email,
      username: options.username,
      password: hashedPassword,
    });
    // check if unique
    try {
      await newUser.save();
    } catch (err) {
      if (err.code === "23505" || err.detail.includes("already exists")) {
        // detail: Key (email)=(asd@asd.com) already exists. => ['Key','','email',...]
        const field = err.detail.split(/[\s\(\)]/g)[2];
        return {
          errors: [{ field: field, message: `${field} already taken` }],
        };
      }
    }
    // auto log in
    req.session.userId = newUser.id;
    return { user: newUser };
  }

  /** ===========================
   * @description query all users
   * @returns [User]
   =========================== */
  @Query(() => [User])
  users(): Promise<User[]> {
    return User.find();
  }

  /** =====================================
   * @description login user
   * @param emailOrUsername emailOrUsername
   * @param password password
   * @returns UserResponse
   ===================================== */
  @Mutation(() => UserResponse)
  async login(
    @Arg("emailOrUsername") emailOrUsername: string,
    @Arg("password") password: string,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    // check if email/username exists in db
    const found = await User.findOne(
      emailOrUsername.includes("@")
        ? { where: { email: emailOrUsername } }
        : { where: { username: emailOrUsername } }
    );
    if (!found) {
      return {
        errors: [{ field: "emailOrUsername", message: "user not found" }],
      };
    }
    // check password
    const valid = await argon2.verify(found.password, password);
    if (!valid) {
      return { errors: [{ field: "password", message: "incorrect password" }] };
    }
    // auto log in
    req.session.userId = found.id;
    return { user: found };
  }

  /** ====================================
   * @description check the user logged in
   * @returns User | null
  ==================================== */
  @Query(() => User, { nullable: true })
  me(@Ctx() { req }: MyContext): undefined | Promise<User | undefined> {
    // if not logged in
    if (!req?.session?.userId) return;
    return User.findOne(req?.session?.userId);
  }

  /** ===================================
   * @description logout the current user
   * @returns boolean
   =================================== */
  @Mutation(() => Boolean)
  logout(@Ctx() { req, res }: MyContext) {
    return new Promise((resolve) => {
      req.session.destroy((err) => {
        if (err) {
          console.log(`------- err :`, JSON.stringify(err, null, 2));
          resolve(false);
          return;
        }
        res.clearCookie(COOKIE_NAME);
        resolve(true);
      });
    });
  }

  /** ===================================
   * @description delete the current user
   * @param email
   * @returns boolean
   =================================== */
  @Mutation(() => Boolean)
  async deleteUser(
    @Arg("email") email: string,
    @Ctx() { req, res }: MyContext
  ): Promise<boolean> {
    // fetch the user
    const found = await User.findOne(req.session.userId);
    if (!found) {
      return false;
    }
    if (found.email !== email) {
      return false;
    }
    // delete the user
    try {
      await User.delete({ email });
      // log out the user
      return new Promise((resolve) => {
        req.session.destroy((err) => {
          if (err) {
            console.log(`------- err :`, JSON.stringify(err, null, 2));
            resolve(false);
            return;
          }
          res.clearCookie(COOKIE_NAME);
          resolve(true);
        });
      });
    } catch (err) {
      return false;
    }
  }

  /** ===========================
   * @description forgot password
   * @param email 
   * @returns boolean
   =========================== */
  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg("email") email: string,
    @Ctx() { redis }: MyContext
  ): Promise<boolean> {
    // check emailOrUsername and fetch user
    const found = await User.findOne({ where: { email } }); // search by a non-PrimaryGeneratedColumn
    if (!found) {
      // email not in db
      // avoid fishing emails through your db
      return true;
    }
    // create a token with uuid
    const token = v4();
    // store the token and userId in redis
    await redis.set(
      FORGOT_PASSWORD_REFIX + token,
      found.id,
      "ex",
      1000 * 60 * 60 * 24 * 3 // 3 days
    );
    // send changePassword link with token
    sendEmail(
      found.email,
      `<a href="http://localhost:3000/change-password/${token}">reset password</a>`
    );
    return true;
  }

  /** ===========================
   * @description change password
   * @param token 
   * @param password 
   * @returns UserResponse
   =========================== */
  @Mutation(() => UserResponse)
  async changePassword(
    @Arg("token") token: string,
    @Arg("newPassword") newPassword: string,
    @Ctx() { redis }: MyContext
  ): Promise<UserResponse> {
    // valid the new password
    if (newPassword.length <= 2) {
      return {
        errors: [{ field: "newPassword", message: "password is too short" }],
      };
    }
    // check token from redis to get userId
    const userId = await redis.get(FORGOT_PASSWORD_REFIX + token);
    if (!userId) {
      return { errors: [{ field: "token", message: "token expired" }] };
    }
    // find the user and update user with the hashed new password
    const userIdNum = Number(userId);
    const found = await User.findOne(userIdNum);
    if (!found) {
      return { errors: [{ field: "token", message: "user no longer exists" }] };
    }
    // update db
    User.update(
      { id: userIdNum },
      { password: await argon2.hash(newPassword) }
    );
    // remove token so can’t use it to change password again
    redis.del(FORGOT_PASSWORD_REFIX + token);
    // auto log in? or let manually log in with new password
    // req.session.userId = Number(userId);
    return { user: found };
  }
}
