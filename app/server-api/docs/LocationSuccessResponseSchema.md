# LocationSuccessResponseSchema


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**data** | [**LocationResponse**](LocationResponse.md) |  | [optional] 
**status** | **str** | Response status | [optional] 

## Example

```python
from nexum-api-client.models.location_success_response_schema import LocationSuccessResponseSchema

# TODO update the JSON string below
json = "{}"
# create an instance of LocationSuccessResponseSchema from a JSON string
location_success_response_schema_instance = LocationSuccessResponseSchema.from_json(json)
# print the JSON string representation of the object
print LocationSuccessResponseSchema.to_json()

# convert the object into a dict
location_success_response_schema_dict = location_success_response_schema_instance.to_dict()
# create an instance of LocationSuccessResponseSchema from a dict
location_success_response_schema_form_dict = location_success_response_schema.from_dict(location_success_response_schema_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


