# nexum-api-client.HealthApi

All URIs are relative to *http://localhost*

Method | HTTP request | Description
------------- | ------------- | -------------
[**api_health_get**](HealthApi.md#api_health_get) | **GET** /api/health | Health check endpoint


# **api_health_get**
> ApiHealthGet200Response api_health_get()

Health check endpoint

### Example


```python
import time
import os
import nexum-api-client
from nexum-api-client.models.api_health_get200_response import ApiHealthGet200Response
from nexum-api-client.rest import ApiException
from pprint import pprint

# Defining the host is optional and defaults to http://localhost
# See configuration.py for a list of all supported configuration parameters.
configuration = nexum-api-client.Configuration(
    host = "http://localhost"
)


# Enter a context with an instance of the API client
with nexum-api-client.ApiClient(configuration) as api_client:
    # Create an instance of the API class
    api_instance = nexum-api-client.HealthApi(api_client)

    try:
        # Health check endpoint
        api_response = api_instance.api_health_get()
        print("The response of HealthApi->api_health_get:\n")
        pprint(api_response)
    except Exception as e:
        print("Exception when calling HealthApi->api_health_get: %s\n" % e)
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

### HTTP response details

| Status code | Description | Response headers |
|-------------|-------------|------------------|
**200** | Service health status |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

