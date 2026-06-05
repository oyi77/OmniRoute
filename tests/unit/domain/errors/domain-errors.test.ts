import { describe, it, expect } from 'vitest';
import {
  DomainError,
  ValidationError,
  DatabaseError,
  ProviderError,
  ERROR_CODES,
} from '@/domain/errors';

describe('Domain Errors', () => {
  describe('DomainError', () => {
    it('should_create_error_with_code_and_message', () => {
      // Arrange
      const code = ERROR_CODES.INTERNAL_ERROR;
      const message = 'Something went wrong';

      // Act
      const error = new DomainError(code, message);

      // Assert
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
      expect(error.statusCode).toBe(500);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should_create_error_with_custom_status_code', () => {
      // Arrange
      const code = ERROR_CODES.VALIDATION_ERROR;
      const message = 'Invalid input';
      const statusCode = 400;

      // Act
      const error = new DomainError(code, message, statusCode);

      // Assert
      expect(error.statusCode).toBe(400);
    });

    it('should_create_error_with_context', () => {
      // Arrange
      const code = ERROR_CODES.VALIDATION_ERROR;
      const message = 'Invalid email';
      const context = { field: 'email', value: 'invalid' };

      // Act
      const error = new DomainError(code, message, 400, context);

      // Assert
      expect(error.context).toEqual(context);
    });

    it('should_serialize_to_json', () => {
      // Arrange
      const error = new DomainError(ERROR_CODES.INTERNAL_ERROR, 'Test', 500, { detail: 'info' });

      // Act
      const json = error.toJSON();

      // Assert
      expect(json).toHaveProperty('code');
      expect(json).toHaveProperty('message');
      expect(json).toHaveProperty('statusCode');
      expect(json).toHaveProperty('timestamp');
    });
  });

  describe('ValidationError', () => {
    it('should_create_validation_error_with_field', () => {
      // Arrange
      const message = 'Email is invalid';
      const field = 'email';

      // Act
      const error = new ValidationError(message, field);

      // Assert
      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.statusCode).toBe(400);
      expect(error.field).toBe(field);
      expect(error.message).toBe(message);
    });

    it('should_create_validation_error_without_field', () => {
      // Arrange
      const message = 'Validation failed';

      // Act
      const error = new ValidationError(message);

      // Assert
      expect(error.field).toBeUndefined();
    });
  });

  describe('DatabaseError', () => {
    it('should_create_database_error_with_query_info', () => {
      // Arrange
      const message = 'Query failed';
      const query = 'SELECT * FROM users';

      // Act
      const error = new DatabaseError(message, query);

      // Assert
      expect(error.code).toBe(ERROR_CODES.DATABASE_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.query).toBe(query);
    });

    it('should_create_database_error_with_cause', () => {
      // Arrange
      const message = 'Connection failed';
      const cause = new Error('ECONNREFUSED');

      // Act
      const error = new DatabaseError(message, undefined, cause);

      // Assert
      expect(error.context.cause).toBe(cause);
    });
  });

  describe('ProviderError', () => {
    it('should_create_provider_error_with_provider_id', () => {
      // Arrange
      const message = 'Provider unavailable';
      const providerId = 'openai';

      // Act
      const error = new ProviderError(message, providerId);

      // Assert
      expect(error.code).toBe(ERROR_CODES.PROVIDER_ERROR);
      expect(error.statusCode).toBe(503);
      expect(error.providerId).toBe(providerId);
    });

    it('should_create_provider_error_with_custom_status', () => {
      // Arrange
      const message = 'Rate limited';
      const providerId = 'anthropic';
      const statusCode = 429;

      // Act
      const error = new ProviderError(message, providerId, statusCode);

      // Assert
      expect(error.statusCode).toBe(429);
    });
  });
});
