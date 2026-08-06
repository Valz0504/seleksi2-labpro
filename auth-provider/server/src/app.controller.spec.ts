import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should identify the auth server', () => {
      expect(appController.root()).toEqual({
        service: 'auth-server',
        message: 'Auth Provider Server is running',
      });
    });

    it('should report a healthy status', () => {
      expect(appController.health()).toMatchObject({
        status: 'ok',
        service: 'auth-server',
      });
    });
  });
});
