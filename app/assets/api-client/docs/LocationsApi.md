# NexumApiClient.LocationsApi

All URIs are relative to *http://localhost*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiLocationsHistoryEntityIdGet**](LocationsApi.md#apiLocationsHistoryEntityIdGet) | **GET** /api/locations/history/{entity_id} | Get location history for an entity
[**apiLocationsLatestGet**](LocationsApi.md#apiLocationsLatestGet) | **GET** /api/locations/latest | Get latest location for each entity
[**apiLocationsNearbyPost**](LocationsApi.md#apiLocationsNearbyPost) | **POST** /api/locations/nearby | Find entities near a location
[**apiLocationsNodeIdGet**](LocationsApi.md#apiLocationsNodeIdGet) | **GET** /api/locations/node-id | Get current node ID
[**apiLocationsPost**](LocationsApi.md#apiLocationsPost) | **POST** /api/locations/ | Record a new location report
[**apiLocationsTypesGet**](LocationsApi.md#apiLocationsTypesGet) | **GET** /api/locations/types | Get list of valid entity types



## apiLocationsHistoryEntityIdGet

> LocationListResponseSchema apiLocationsHistoryEntityIdGet(entityId, opts)

Get location history for an entity

Retrieve location history for a specific entity

### Example

```javascript
import NexumApiClient from 'nexum-api-client';

let apiInstance = new NexumApiClient.LocationsApi();
let entityId = "entityId_example"; // String | Entity UUID
let opts = {
  'since': 56, // Number | UTC milliseconds timestamp (optional)
  'limit': 100 // Number | Maximum number of results (default: 100)
};
apiInstance.apiLocationsHistoryEntityIdGet(entityId, opts).then((data) => {
  console.log('API called successfully. Returned data: ' + data);
}, (error) => {
  console.error(error);
});

```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **entityId** | **String**| Entity UUID | 
 **since** | **Number**| UTC milliseconds timestamp (optional) | [optional] 
 **limit** | **Number**| Maximum number of results (default: 100) | [optional] [default to 100]

### Return type

[**LocationListResponseSchema**](LocationListResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## apiLocationsLatestGet

> LocationListResponseSchema apiLocationsLatestGet(opts)

Get latest location for each entity

Retrieve the most recent location report for each entity

### Example

```javascript
import NexumApiClient from 'nexum-api-client';

let apiInstance = new NexumApiClient.LocationsApi();
let opts = {
  'type': "type_example", // String | Filter by entity type (optional)
  'limit': 100 // Number | Maximum number of results (default: 100)
};
apiInstance.apiLocationsLatestGet(opts).then((data) => {
  console.log('API called successfully. Returned data: ' + data);
}, (error) => {
  console.error(error);
});

```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **type** | **String**| Filter by entity type (optional) | [optional] 
 **limit** | **Number**| Maximum number of results (default: 100) | [optional] [default to 100]

### Return type

[**LocationListResponseSchema**](LocationListResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## apiLocationsNearbyPost

> NearbyResponseSchema apiLocationsNearbyPost(nearbyRequestSchema)

Find entities near a location

Search for entities within a specified radius of a location

### Example

```javascript
import NexumApiClient from 'nexum-api-client';

let apiInstance = new NexumApiClient.LocationsApi();
let nearbyRequestSchema = new NexumApiClient.NearbyRequestSchema(); // NearbyRequestSchema | 
apiInstance.apiLocationsNearbyPost(nearbyRequestSchema).then((data) => {
  console.log('API called successfully. Returned data: ' + data);
}, (error) => {
  console.error(error);
});

```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **nearbyRequestSchema** | [**NearbyRequestSchema**](NearbyRequestSchema.md)|  | 

### Return type

[**NearbyResponseSchema**](NearbyResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


## apiLocationsNodeIdGet

> NodeIdResponseSchema apiLocationsNodeIdGet()

Get current node ID

Retrieve the ID of the current mesh node

### Example

```javascript
import NexumApiClient from 'nexum-api-client';

let apiInstance = new NexumApiClient.LocationsApi();
apiInstance.apiLocationsNodeIdGet().then((data) => {
  console.log('API called successfully. Returned data: ' + data);
}, (error) => {
  console.error(error);
});

```

### Parameters

This endpoint does not need any parameter.

### Return type

[**NodeIdResponseSchema**](NodeIdResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json


## apiLocationsPost

> LocationSuccessResponseSchema apiLocationsPost(locationRequestSchema)

Record a new location report

Add a location report for an entity (responder, civilian, etc.)

### Example

```javascript
import NexumApiClient from 'nexum-api-client';

let apiInstance = new NexumApiClient.LocationsApi();
let locationRequestSchema = new NexumApiClient.LocationRequestSchema(); // LocationRequestSchema | 
apiInstance.apiLocationsPost(locationRequestSchema).then((data) => {
  console.log('API called successfully. Returned data: ' + data);
}, (error) => {
  console.error(error);
});

```

### Parameters


Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **locationRequestSchema** | [**LocationRequestSchema**](LocationRequestSchema.md)|  | 

### Return type

[**LocationSuccessResponseSchema**](LocationSuccessResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: application/json
- **Accept**: application/json


## apiLocationsTypesGet

> EntityTypesResponseSchema apiLocationsTypesGet()

Get list of valid entity types

Retrieve all valid entity type values

### Example

```javascript
import NexumApiClient from 'nexum-api-client';

let apiInstance = new NexumApiClient.LocationsApi();
apiInstance.apiLocationsTypesGet().then((data) => {
  console.log('API called successfully. Returned data: ' + data);
}, (error) => {
  console.error(error);
});

```

### Parameters

This endpoint does not need any parameter.

### Return type

[**EntityTypesResponseSchema**](EntityTypesResponseSchema.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

