import { Field, InputType } from "type-graphql";

@InputType()
export class EmailUsernamePassword {
  @Field()
  email: string;
  @Field()
  username: string;
  @Field()
  password: string;
}
