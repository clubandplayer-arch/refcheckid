export const options = {
  scenarios: {
    load: { executor: 'constant-vus', vus: 50, duration: '5m' },
    stress: { executor: 'ramping-vus', stages: [{ duration: '5m', target: 250 }, { duration: '5m', target: 0 }] },
    spike: { executor: 'ramping-vus', stages: [{ duration: '30s', target: 500 }, { duration: '30s', target: 0 }] },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750'],
  },
};

export default function refcheckidPerformancePlaceholder() {
  // Intentionally not executed by CI until a deployed test environment is available.
}
