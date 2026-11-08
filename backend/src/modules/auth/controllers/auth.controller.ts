import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../../../common/current-user.decorator";
import { User } from "../../../users/user.entity";
import { AuthService } from "../services/auth.service";
import {
  ChangePasswordDto,
  DeleteAccountDto,
  ForgotPasswordDto,
  GoogleTokenDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  SetEmailDto,
  SignUpDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from "../dto/auth.dto";

@Controller("auth")
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup")
  signUp(@Body() body: SignUpDto) {
    return this.auth.signUp(body.name, body.email, body.password, body.contactEmail);
  }

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Post("google")
  google(@Body() body: GoogleTokenDto) {
    return this.auth.signInWithGoogle(body.idToken);
  }

  @Post("google/link")
  @UseGuards(AuthGuard("jwt"))
  linkGoogle(@CurrentUser() user: User, @Body() body: GoogleTokenDto) {
    return this.auth.linkGoogle(user.id, body.idToken);
  }

  @Delete("google")
  @UseGuards(AuthGuard("jwt"))
  unlinkGoogle(@CurrentUser() user: User) {
    return this.auth.unlinkGoogle(user.id);
  }

  @Post("email")
  @UseGuards(AuthGuard("jwt"))
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  setEmail(@CurrentUser() user: User, @Body() body: SetEmailDto) {
    return this.auth.setEmail(user.id, body.email);
  }

  @Post("email/resend")
  @UseGuards(AuthGuard("jwt"))
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendEmailCode(@CurrentUser() user: User) {
    return this.auth.resendEmailCode(user.id);
  }

  @Post("email/verify")
  @UseGuards(AuthGuard("jwt"))
  verifyEmail(@CurrentUser() user: User, @Body() body: VerifyEmailDto) {
    return this.auth.verifyEmail(user.id, body.code);
  }

  @Post("password/forgot")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(body.login);
  }

  @Post("password/reset")
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body.login, body.code, body.newPassword);
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
    return this.auth.updateProfile(user.id, {
      name: body.name,
      email: body.email,
    });
  }

  @Post("change-password")
  @UseGuards(AuthGuard("jwt"))
  changePassword(@CurrentUser() user: User, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  @Delete("me")
  @UseGuards(AuthGuard("jwt"))
  deleteMe(@CurrentUser() user: User, @Body() body: DeleteAccountDto) {
    return this.auth.deleteAccount(user.id, { password: body.password, googleIdToken: body.googleIdToken });
  }
}
