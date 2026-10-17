import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { Person, PersonSchema } from '../people/person.schema'
import { Session, SessionSchema } from './session.schema'
import { SignInLink, SignInLinkSchema } from './sign-in-link.schema'
import { AuditModule } from '../audit/audit.module'
import { AuthSessionGuard } from './auth-session.guard'
import { RolesGuard } from './roles.guard'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Person.name, schema: PersonSchema },
      { name: Session.name, schema: SessionSchema },
      { name: SignInLink.name, schema: SignInLinkSchema },
    ]),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: AuthSessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
