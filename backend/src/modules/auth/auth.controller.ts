import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../../common/current-user.decorator";
import { User } from "../../users/user.entity";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto, RefreshDto, SignUpDto, UpdateProfileDto } from "./dto";

@Controller("auth")
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup")
  signUp(@Body() body: SignUpDto) {
    return this.auth.signUp(body.name, body.email, body.password);
  }

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Post("refresh")
  refresh(@Body() body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  logout(@Body() body: RefreshDto) {
    return this.auth.logout(body.refreshToken);
  }

  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  me(@CurrentUser() user: User) {
    return this.auth.toPublicUser(user);
  }

  @Patch("me")
  @UseGuards(AuthGuard("jwt"))
  updateMe(@CurrentUser() user: User, @Body() body: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, body.name);
  }

  @Post("change-password")
  @UseGuards(AuthGuard("jwt"))
  changePassword(@CurrentUser() user: User, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }
}
