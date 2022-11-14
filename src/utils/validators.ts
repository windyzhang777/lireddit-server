import { EmailUsernamePassword } from "../resolvers/EmailUsernamePassword";

export const validateRegister = (options: EmailUsernamePassword) => {
  if (!options.email.includes("@")) {
    return [{ field: "email", message: "invalid email" }];
  }

  if (options.username.length <= 2) {
    return [{ field: "username", message: "username is too short" }];
  }

  if (options.username.includes("@")) {
    return [{ field: "username", message: "username cannot include @" }];
  }

  if (options.password.length <= 2) {
    return [{ field: "password", message: "password is too short" }];
  }

  return null;
};
