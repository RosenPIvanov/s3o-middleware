/**
 * Basic spec for s3o-middleware
 *
 * N.b., this approach doesn't exercise authenticateToken at all.
 * @TODO Write a test spec for authenticateToken.
 */

const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const proxyquire = require('proxyquire');

chai.should();
chai.use(sinonChai);

const validatorStub = sinon.stub();

const nextStub = sinon.stub();
nextStub.returns('next returned');

describe('s3o-middleware', () => {
	let reqFixture;
	let resFixture;
	let s3o;

	const runs = [
		{
			version: 'v3',
			options: {
				requestHeader: {},
				redirectLocation: 'https://s3o.ft.com/v2/authenticate?post=true&host=localhost&redirect=https%3A%2F%2Flocalhosthttp%3A%2F%2Flocalhost'
			}
		},
		{
			version: 'v4',
			options: {
				requestHeader: {
					'x-s3o-version': 'v4',
					'x-s3o-systemcode': 'system-code'
				},
				redirectLocation: 'https://s3ov4.in.ft.com/v2/authenticate?post=true&host=localhost&redirect=https%3A%2F%2Flocalhosthttp%3A%2F%2Flocalhost&systemcode=system-code'
			}
		}
	];

	beforeEach(() => {
		validatorStub.resetHistory();
		nextStub.resetHistory();

		// Reset overridden fixtures
		reqFixture = {
			cookies: {
				s3o_username: 'test',
				s3o_token: 'test-test-123',
			},
			hostname: 'localhost',
			headers: {
				'transfer-encoding': 'utf8'
			}
		};

		resFixture = {
			clearCookie: sinon.spy(),
			status: sinon.spy(),
			send: sinon.spy(),
			header: sinon.spy(),
			locals: {},
			app: {
				get: () => 9999,
			},
			cookie: sinon.spy(),
			redirect: sinon.stub(),
		};

		s3o = proxyquire('../', {
			'@financial-times/s3o-middleware-utils/authenticate': {
				authenticateToken: validatorStub,
			},
		});
	});

	runs.forEach((run) => {
		describe('normal authentication', () => {
			describe('when user POSTs a username', () => {
				it('redirects if user authenticates', () => {
					validatorStub.returns(true);
					reqFixture.method = 'POST';
					reqFixture.query = {
						username: 'test',
					};
					reqFixture.body = {
						token: 'abc123',
					};
					reqFixture.originalUrl = 'http://localhost';

					s3o(reqFixture, resFixture, nextStub);

					validatorStub.withArgs('test', 'localhost', 'abc123').should.have.been.calledOnce;
					resFixture.header.withArgs('Cache-Control', 'private, no-cache, no-store, must-revalidate')
						.should.have.been.calledOnce;
					resFixture.header.withArgs('Pragma', 'no-cache').should.have.been.calledOnce;
					resFixture.header.withArgs('Expires', 0).should.have.been.calledOnce;
					resFixture.redirect.withArgs('http://localhost/').should.have.been.calledOnce;
				});

				it('responds with error message if authentication fails', () => {
					validatorStub.returns(false);

					s3o(reqFixture, resFixture, nextStub);

					validatorStub.withArgs('test', 'localhost', 'test-test-123').should.have.been.calledOnce;
					resFixture.send
						.withArgs('<h1>Authentication error.</h1><p>For access, please log in with your FT account</p>')
						.should.have.been.calledOnce;
				});
			});

			describe('when user has cookies', () => {
				it('calls next() after authenticating cookies', () => {
					reqFixture.method = 'GET';
					validatorStub.returns(true);

					s3o(reqFixture, resFixture, nextStub);

					validatorStub.withArgs('test', 'localhost', 'test-test-123').should.have.been.calledOnce;
					nextStub.should.have.been.calledOnce;
				});

				it('responds with error message if authentication fails', () => {
					reqFixture.method = 'GET';
					validatorStub.returns(false);

					s3o(reqFixture, resFixture, nextStub);

					validatorStub.withArgs('test', 'localhost', 'test-test-123').should.have.been.calledOnce;
					nextStub.should.not.have.been.called;
					resFixture.send.withArgs('<h1>Authentication error.</h1><p>For access, please log in with your FT account</p>')
						.should.have.been.calledOnce;
				});
			});

			describe('when user is unauthenticated', () => {
				it('redirects to s3o login URL', () => {
					delete reqFixture.cookies;
					delete reqFixture.query;
					delete reqFixture.method;
					reqFixture.headers.host = 'localhost';
					reqFixture.headers = Object.assign(reqFixture.headers, run.options.requestHeader);
					reqFixture.originalUrl = 'http://localhost';
					reqFixture.protocol = 'https';
					resFixture.redirect.returns('redirect returned');

					const result = s3o(reqFixture, resFixture, nextStub);

					resFixture.header.withArgs('Cache-Control', 'private, no-cache, no-store, must-revalidate')
						.should.have.been.calledOnce;
					resFixture.header.withArgs('Pragma', 'no-cache').should.have.been.calledOnce;
					resFixture.header.withArgs('Expires', 0).should.have.been.calledOnce;
					resFixture.redirect.withArgs(run.options.redirectLocation)
						.should.have.been.calledOnce;
					result.should.equal('redirect returned');
				});
			});
		});

		describe('no redirect authentication',() => {
			it('calls next() on successful authentication',() => {
				validatorStub.returns(true);

				const result = s3o.authS3ONoRedirect(reqFixture,resFixture,nextStub);

				validatorStub.withArgs('test','localhost','test-test-123').should.have.been.calledOnce;
				nextStub.should.have.been.calledOnce;
				result.should.equal('next returned');
			});

			it('returns 403 on authentication failure',() => {
				validatorStub.returns(false);

				s3o.authS3ONoRedirect(reqFixture,resFixture,nextStub);

				validatorStub.withArgs('test','localhost','test-test-123').should.have.been.calledOnce;
				nextStub.should.not.have.been.called;
				resFixture.clearCookie.withArgs('s3o_username').should.have.been.calledOnce;
				resFixture.clearCookie.withArgs('s3o_token').should.have.been.calledOnce;
				resFixture.status.withArgs(403).should.have.been.calledOnce;
				resFixture.send.withArgs('Forbidden').should.have.been.calledOnce;
			});
		});
	});
});
