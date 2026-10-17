import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { Error as MongooseError } from 'mongoose'

/**
 * Turns database errors a request caused into plain 4xx answers instead of a 500:
 * a duplicate unique value (E11000) is 409, a malformed id or invalid value is 400.
 * Everything else goes to Nest's normal handling.
 */
@Catch()
export class MongoErrorsFilter extends BaseExceptionFilter {
  catch(err: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse()
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || err.keyValue || {})[0]
      const label = field === 'serialNumber' ? 'serial number' : field || 'value'
      res.status(HttpStatus.CONFLICT).json({ statusCode: 409, message: `That ${label} is already in use` })
      return
    }
    if (err instanceof MongooseError.CastError) {
      res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: `Invalid ${err.path}` })
      return
    }
    if (err instanceof MongooseError.ValidationError) {
      const message = Object.values(err.errors).map((e) => e.message).join('; ') || 'Invalid data'
      res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message })
      return
    }
    super.catch(err, host)
  }
}
