# NexumApiClient.HealthApi

All URIs are relative to *http://localhost*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiHealthGet**](HealthApi.md#apiHealthGet) | **GET** /api/health | Health check endpoint



## apiHealthGet

> ApiHealthGet200Response apiHealthGet()

Health check endpoint

### Example

```javascript
import NexumApiClient from 'nexum-api-client';

let apiInstance = new NexumApiClient.HealthApi();
apiInstance.apiHealthGet().then((data) => {
  console.log('API called successfully. Returned data: ' + data);
}, (error) => {
  console.error(error);
});

```

### Parameters

This endpoint does not need any parameter.

### Return type

[**ApiHealthGet200Response**](ApiHealthGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

