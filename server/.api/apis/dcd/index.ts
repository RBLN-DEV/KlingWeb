import type * as types from './types';
import type { ConfigOptions, FetchResponse } from 'api/dist/core'
import Oas from 'oas';
import APICore from 'api/dist/core';
import definition from './openapi.json';

class SDK {
  spec: Oas;
  core: APICore;

  constructor() {
    this.spec = Oas.init(definition);
    this.core = new APICore(this.spec, 'dcd/1.2 (api/6.1.3)');
  }

  /**
   * Optionally configure various options that the SDK allows.
   *
   * @param config Object of supported SDK options and toggles.
   * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
   * should be represented in milliseconds.
   */
  config(config: ConfigOptions) {
    this.core.setConfig(config);
  }

  /**
   * If the API you're using requires authentication you can supply the required credentials
   * through this method and the library will magically determine how they should be used
   * within your API request.
   *
   * With the exception of OpenID and MutualTLS, it supports all forms of authentication
   * supported by the OpenAPI specification.
   *
   * @example <caption>HTTP Basic auth</caption>
   * sdk.auth('username', 'password');
   *
   * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
   * sdk.auth('myBearerToken');
   *
   * @example <caption>API Keys</caption>
   * sdk.auth('myApiKey');
   *
   * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
   * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
   * @param values Your auth credentials for the API; can specify up to two strings or numbers.
   */
  auth(...values: string[] | number[]) {
    this.core.setAuth(...values);
    return this;
  }

  /**
   * If the API you're using offers alternate server URLs, and server variables, you can tell
   * the SDK which one to use with this method. To use it you can supply either one of the
   * server URLs that are contained within the OpenAPI definition (along with any server
   * variables), or you can pass it a fully qualified URL to use (that may or may not exist
   * within the OpenAPI definition).
   *
   * @example <caption>Server URL with server variables</caption>
   * sdk.server('https://{region}.api.example.com/{basePath}', {
   *   name: 'eu',
   *   basePath: 'v14',
   * });
   *
   * @example <caption>Fully qualified server URL</caption>
   * sdk.server('https://eu.api.example.com/v14');
   *
   * @param url Server URL
   * @param variables An object of variables to replace into the server URL.
   */
  server(url: string, variables = {}) {
    this.core.setServer(url, variables);
  }

  /**
   * Get a list of endpoints by a specified type for Residential subscription
   *
   * @summary Get endpoints by type
   * @throws FetchError<400, types.GetEndpointsByTypeResponse400> 400
   */
  getEndpointsByType(metadata: types.GetEndpointsByTypeMetadataParam): Promise<FetchResponse<200, types.GetEndpointsByTypeResponse200>> {
    return this.core.fetch('/v2/endpoints/{type}', 'get', metadata);
  }

  /**
   * Get types of endpoints for Residential subscription
   *
   * @summary Get endpoints
   * @throws FetchError<400, types.GetEndpointsResponse400> 400
   */
  getEndpoints(): Promise<FetchResponse<200, types.GetEndpointsResponse200>> {
    return this.core.fetch('/v2/endpoints', 'get');
  }

  /**
   * Generate custom back connect endpoints for proxying for Residential subscription. If a
   * default value is preset you don't need to actually include it in the request param
   * query.
   *
   * @summary Generate custom back connect endpoints
   * @throws FetchError<400, types.GenerateCustomBackConnectEndpointsResponse400> 400
   */
  generateCustomBackConnectEndpoints(metadata?: types.GenerateCustomBackConnectEndpointsMetadataParam): Promise<FetchResponse<200, types.GenerateCustomBackConnectEndpointsResponse200>> {
    return this.core.fetch('/v2/endpoints-custom/back-connect', 'get', metadata);
  }

  /**
   * Generate custom endpoints for proxying for Residential and Datacenter Pay per GB
   * (DEPRECATED) subscriptions. If a default value is preset you don't need to actually
   * include it in the request param query.
   *
   * @summary Generate custom endpoints
   * @throws FetchError<400, types.GenerateCustomEndpointsResponse400> 400
   */
  generateCustomEndpoints(metadata?: types.GenerateCustomEndpointsMetadataParam): Promise<FetchResponse<200, types.GenerateCustomEndpointsResponse200>> {
    return this.core.fetch('/v2/endpoints-custom', 'get', metadata);
  }

  /**
   * Get a list of active sub users for Residential subscription
   *
   * @summary Get sub users
   * @throws FetchError<400, types.GetSubUsersResponse400> 400
   */
  getSubUsers(metadata?: types.GetSubUsersMetadataParam): Promise<FetchResponse<200, types.GetSubUsersResponse200>> {
    return this.core.fetch('/v2/sub-users', 'get', metadata);
  }

  /**
   * Create a new sub user for Residential subscription
   *
   * @summary Create sub user
   * @throws FetchError<400, types.CreateSubUserResponse400> 400
   */
  createSubUser(body: types.CreateSubUserBodyParam): Promise<FetchResponse<201, types.CreateSubUserResponse201>> {
    return this.core.fetch('/v2/sub-users', 'post', body);
  }

  /**
   * Get a single active sub user
   *
   * @summary Get sub user
   * @throws FetchError<400, types.GetSubUserResponse400> 400
   */
  getSubUser(metadata: types.GetSubUserMetadataParam): Promise<FetchResponse<200, types.GetSubUserResponse200>> {
    return this.core.fetch('/v2/sub-users/{sub_user_id}', 'get', metadata);
  }

  /**
   * Update password or traffic limit of specified sub user
   *
   * @summary Update sub user
   * @throws FetchError<400, types.UpdateSubUserResponse400> 400
   */
  updateSubUser(body: types.UpdateSubUserBodyParam, metadata: types.UpdateSubUserMetadataParam): Promise<FetchResponse<201, types.UpdateSubUserResponse201>>;
  updateSubUser(metadata: types.UpdateSubUserMetadataParam): Promise<FetchResponse<201, types.UpdateSubUserResponse201>>;
  updateSubUser(body?: types.UpdateSubUserBodyParam | types.UpdateSubUserMetadataParam, metadata?: types.UpdateSubUserMetadataParam): Promise<FetchResponse<201, types.UpdateSubUserResponse201>> {
    return this.core.fetch('/v2/sub-users/{sub_user_id}', 'put', body, metadata);
  }

  /**
   * Delete specified sub user
   *
   * @summary Delete sub user
   * @throws FetchError<400, types.DeleteSubUserResponse400> 400
   */
  deleteSubUser(metadata: types.DeleteSubUserMetadataParam): Promise<FetchResponse<204, types.DeleteSubUserResponse204>> {
    return this.core.fetch('/v2/sub-users/{sub_user_id}', 'delete', metadata);
  }

  /**
   * Get traffic usage of specified sub user
   *
   * @summary Get sub user traffic
   * @throws FetchError<400, types.GetSubUserTrafficResponse400> 400
   */
  getSubUserTraffic(metadata: types.GetSubUserTrafficMetadataParam): Promise<FetchResponse<200, types.GetSubUserTrafficResponse200>> {
    return this.core.fetch('/v2/sub-users/{sub_user_id}/traffic', 'get', metadata);
  }

  /**
   * Get allocated traffic across all of your sub users for Residential subscription
   *
   * @summary Get allocated sub user traffic
   * @throws FetchError<400, types.GetAllocatedSubUserTrafficResponse400> 400
   */
  getAllocatedSubUserTraffic(metadata?: types.GetAllocatedSubUserTrafficMetadataParam): Promise<FetchResponse<200, types.GetAllocatedSubUserTrafficResponse200>> {
    return this.core.fetch('/v2/allocated-traffic-limit', 'get', metadata);
  }

  /**
   * Get a list of whitelisted IPs for Residential subscription
   *
   * @summary Get whitelisted IPs
   * @throws FetchError<400, types.GetWhitelistedIpsResponse400> 400
   */
  getWhitelistedIps(): Promise<FetchResponse<200, types.GetWhitelistedIpsResponse200>> {
    return this.core.fetch('/v2/whitelisted-ips', 'get');
  }

  /**
   * Whitelist your IPs here for Residential subscription
   *
   * @summary Add whitelisted IPs
   * @throws FetchError<400, types.AddWhitelistedIpsResponse400> 400
   */
  addWhitelistedIps(body?: types.AddWhitelistedIpsBodyParam): Promise<FetchResponse<200, types.AddWhitelistedIpsResponse200>> {
    return this.core.fetch('/v2/whitelisted-ips', 'post', body);
  }

  /**
   * Delete a specified whitelisted IP
   *
   * @summary Delete whitelisted IP
   * @throws FetchError<400, types.DeleteWhitelistedIpResponse400> 400
   */
  deleteWhitelistedIp(metadata: types.DeleteWhitelistedIpMetadataParam): Promise<FetchResponse<204, types.DeleteWhitelistedIpResponse204>> {
    return this.core.fetch('/v2/whitelisted-ips/{id}', 'delete', metadata);
  }

  /**
   * Detailed information about your current subscription for Residential subscription
   *
   * @summary Get subscriptions
   * @throws FetchError<400, types.GetSubscriptionsResponse400> 400
   */
  getSubscriptions(): Promise<FetchResponse<200, types.GetSubscriptionsResponse200>> {
    return this.core.fetch('/v2/subscriptions', 'get');
  }
}

const createSDK = (() => { return new SDK(); })()
;

export default createSDK;

export type { AddWhitelistedIpsBodyParam, AddWhitelistedIpsResponse200, AddWhitelistedIpsResponse400, CreateSubUserBodyParam, CreateSubUserResponse201, CreateSubUserResponse400, DeleteSubUserMetadataParam, DeleteSubUserResponse204, DeleteSubUserResponse400, DeleteWhitelistedIpMetadataParam, DeleteWhitelistedIpResponse204, DeleteWhitelistedIpResponse400, GenerateCustomBackConnectEndpointsMetadataParam, GenerateCustomBackConnectEndpointsResponse200, GenerateCustomBackConnectEndpointsResponse400, GenerateCustomEndpointsMetadataParam, GenerateCustomEndpointsResponse200, GenerateCustomEndpointsResponse400, GetAllocatedSubUserTrafficMetadataParam, GetAllocatedSubUserTrafficResponse200, GetAllocatedSubUserTrafficResponse400, GetEndpointsByTypeMetadataParam, GetEndpointsByTypeResponse200, GetEndpointsByTypeResponse400, GetEndpointsResponse200, GetEndpointsResponse400, GetSubUserMetadataParam, GetSubUserResponse200, GetSubUserResponse400, GetSubUserTrafficMetadataParam, GetSubUserTrafficResponse200, GetSubUserTrafficResponse400, GetSubUsersMetadataParam, GetSubUsersResponse200, GetSubUsersResponse400, GetSubscriptionsResponse200, GetSubscriptionsResponse400, GetWhitelistedIpsResponse200, GetWhitelistedIpsResponse400, UpdateSubUserBodyParam, UpdateSubUserMetadataParam, UpdateSubUserResponse201, UpdateSubUserResponse400 } from './types';
