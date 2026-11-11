import request from 'supertest';
import type { Express } from 'express';

let counter = 0;

/** A supertest agent (keeps cookies like a browser) signed up as a fresh user. */
export async function signedUpAgent(app: Express, name = 'Test User') {
  counter += 1;
  const agent = request.agent(app);
  const res = await agent
    .post('/auth/signup')
    .send({ name, email: `user${counter}-${Date.now()}@example.com`, password: 'test-password' })
    .expect(201);
  return { agent, user: res.body.user as { id: string; email: string; name: string } };
}
