import { MemberBootstrapError } from './member-bootstrap';

type BootstrapResult = {
  memberId: string;
  lineUserId: string;
};

type Dependencies = {
  bootstrap(authorization?: string): Promise<BootstrapResult>;
};

export function createMemberBootstrapRoutes(dependencies: Dependencies) {
  return {
    async post({ authorization }: { authorization?: string }) {
      try {
        return {
          status: 200,
          body: await dependencies.bootstrap(authorization),
        };
      } catch (error) {
        if (error instanceof MemberBootstrapError) {
          return {
            status: error.status,
            body: { error: { code: error.code } },
          };
        }
        return {
          status: 502,
          body: { error: { code: 'MEMBER_BOOTSTRAP_FAILED' } },
        };
      }
    },
  };
}
