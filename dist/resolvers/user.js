"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserResolver = void 0;
const argon2_1 = __importDefault(require("argon2"));
const User_1 = require("../entities/User");
const type_graphql_1 = require("type-graphql");
const EmailUsernamePassword_1 = require("./EmailUsernamePassword");
const validators_1 = require("../utils/validators");
const constants_1 = require("../constants");
const uuid_1 = require("uuid");
const sendEmail_1 = require("../utils/sendEmail");
let FieldError = class FieldError {
};
__decorate([
    type_graphql_1.Field(),
    __metadata("design:type", String)
], FieldError.prototype, "field", void 0);
__decorate([
    type_graphql_1.Field(),
    __metadata("design:type", String)
], FieldError.prototype, "message", void 0);
FieldError = __decorate([
    type_graphql_1.ObjectType()
], FieldError);
let UserResponse = class UserResponse {
};
__decorate([
    type_graphql_1.Field(() => [FieldError], { nullable: true }),
    __metadata("design:type", Array)
], UserResponse.prototype, "errors", void 0);
__decorate([
    type_graphql_1.Field(() => User_1.User, { nullable: true }),
    __metadata("design:type", User_1.User)
], UserResponse.prototype, "user", void 0);
UserResponse = __decorate([
    type_graphql_1.ObjectType()
], UserResponse);
let UserResolver = class UserResolver {
    email(user, { req }) {
        if (req.session.userId === user.id) {
            return user.email;
        }
        return "";
    }
    register(options, { req }) {
        return __awaiter(this, void 0, void 0, function* () {
            const errors = validators_1.validateRegister(options);
            if (errors) {
                return { errors };
            }
            const hashedPassword = yield argon2_1.default.hash(options.password);
            const newUser = User_1.User.create({
                email: options.email,
                username: options.username,
                password: hashedPassword,
            });
            try {
                yield newUser.save();
            }
            catch (err) {
                if (err.code === "23505" || err.detail.includes("already exists")) {
                    const field = err.detail.split(/[\s\(\)]/g)[2];
                    return {
                        errors: [{ field: field, message: `${field} already taken` }],
                    };
                }
            }
            req.session.userId = newUser.id;
            return { user: newUser };
        });
    }
    users() {
        return User_1.User.find();
    }
    login(emailOrUsername, password, { req }) {
        return __awaiter(this, void 0, void 0, function* () {
            const found = yield User_1.User.findOne(emailOrUsername.includes("@")
                ? { where: { email: emailOrUsername } }
                : { where: { username: emailOrUsername } });
            if (!found) {
                return {
                    errors: [{ field: "emailOrUsername", message: "user not found" }],
                };
            }
            const valid = yield argon2_1.default.verify(found.password, password);
            if (!valid) {
                return { errors: [{ field: "password", message: "incorrect password" }] };
            }
            req.session.userId = found.id;
            return { user: found };
        });
    }
    me({ req }) {
        var _a, _b;
        if (!((_a = req === null || req === void 0 ? void 0 : req.session) === null || _a === void 0 ? void 0 : _a.userId))
            return;
        return User_1.User.findOne((_b = req === null || req === void 0 ? void 0 : req.session) === null || _b === void 0 ? void 0 : _b.userId);
    }
    logout({ req, res }) {
        return new Promise((resolve) => {
            req.session.destroy((err) => {
                if (err) {
                    console.log(`------- err :`, JSON.stringify(err, null, 2));
                    resolve(false);
                    return;
                }
                res.clearCookie(constants_1.COOKIE_NAME);
                resolve(true);
            });
        });
    }
    deleteUser(email, { req, res }) {
        return __awaiter(this, void 0, void 0, function* () {
            const found = yield User_1.User.findOne(req.session.userId);
            if (!found) {
                return false;
            }
            if (found.email !== email) {
                return false;
            }
            try {
                yield User_1.User.delete({ email });
                return new Promise((resolve) => {
                    req.session.destroy((err) => {
                        if (err) {
                            console.log(`------- err :`, JSON.stringify(err, null, 2));
                            resolve(false);
                            return;
                        }
                        res.clearCookie(constants_1.COOKIE_NAME);
                        resolve(true);
                    });
                });
            }
            catch (err) {
                return false;
            }
        });
    }
    forgotPassword(email, { redis }) {
        return __awaiter(this, void 0, void 0, function* () {
            const found = yield User_1.User.findOne({ where: { email } });
            if (!found) {
                return true;
            }
            const token = uuid_1.v4();
            yield redis.set(constants_1.FORGOT_PASSWORD_REFIX + token, found.id, "ex", 1000 * 60 * 60 * 24 * 3);
            sendEmail_1.sendEmail(found.email, `<a href="http://localhost:3000/change-password/${token}">reset password</a>`);
            return true;
        });
    }
    changePassword(token, newPassword, { redis }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (newPassword.length <= 2) {
                return {
                    errors: [{ field: "newPassword", message: "password is too short" }],
                };
            }
            const userId = yield redis.get(constants_1.FORGOT_PASSWORD_REFIX + token);
            if (!userId) {
                return { errors: [{ field: "token", message: "token expired" }] };
            }
            const userIdNum = Number(userId);
            const found = yield User_1.User.findOne(userIdNum);
            if (!found) {
                return { errors: [{ field: "token", message: "user no longer exists" }] };
            }
            User_1.User.update({ id: userIdNum }, { password: yield argon2_1.default.hash(newPassword) });
            redis.del(constants_1.FORGOT_PASSWORD_REFIX + token);
            return { user: found };
        });
    }
};
__decorate([
    type_graphql_1.FieldResolver(() => String),
    __param(0, type_graphql_1.Root()), __param(1, type_graphql_1.Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [User_1.User, Object]),
    __metadata("design:returntype", String)
], UserResolver.prototype, "email", null);
__decorate([
    type_graphql_1.Mutation(() => UserResponse),
    __param(0, type_graphql_1.Arg("options")),
    __param(1, type_graphql_1.Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [EmailUsernamePassword_1.EmailUsernamePassword, Object]),
    __metadata("design:returntype", Promise)
], UserResolver.prototype, "register", null);
__decorate([
    type_graphql_1.Query(() => [User_1.User]),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UserResolver.prototype, "users", null);
__decorate([
    type_graphql_1.Mutation(() => UserResponse),
    __param(0, type_graphql_1.Arg("emailOrUsername")),
    __param(1, type_graphql_1.Arg("password")),
    __param(2, type_graphql_1.Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], UserResolver.prototype, "login", null);
__decorate([
    type_graphql_1.Query(() => User_1.User, { nullable: true }),
    __param(0, type_graphql_1.Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], UserResolver.prototype, "me", null);
__decorate([
    type_graphql_1.Mutation(() => Boolean),
    __param(0, type_graphql_1.Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UserResolver.prototype, "logout", null);
__decorate([
    type_graphql_1.Mutation(() => Boolean),
    __param(0, type_graphql_1.Arg("email")),
    __param(1, type_graphql_1.Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UserResolver.prototype, "deleteUser", null);
__decorate([
    type_graphql_1.Mutation(() => Boolean),
    __param(0, type_graphql_1.Arg("email")),
    __param(1, type_graphql_1.Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UserResolver.prototype, "forgotPassword", null);
__decorate([
    type_graphql_1.Mutation(() => UserResponse),
    __param(0, type_graphql_1.Arg("token")),
    __param(1, type_graphql_1.Arg("newPassword")),
    __param(2, type_graphql_1.Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], UserResolver.prototype, "changePassword", null);
UserResolver = __decorate([
    type_graphql_1.Resolver(User_1.User)
], UserResolver);
exports.UserResolver = UserResolver;
//# sourceMappingURL=user.js.map