import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentHealth } from './DeploymentHealth';

test('deployment health exposes only a valid commit SHA', () => {
  const sha = '80f83252672f1f5be46f228e5c93ccbcbbb9c9f1';
  assert.deepEqual(deploymentHealth(sha), {status:'ok',commit:sha});
  assert.deepEqual(deploymentHealth(undefined), {status:'ok',commit:null});
  assert.deepEqual(deploymentHealth('not-a-revision'), {status:'ok',commit:null});
});
